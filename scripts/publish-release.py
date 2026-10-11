#!/usr/bin/env python3
"""Run documented HSK setup/wizard and publish the prepared static release."""
import argparse
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--cli', default='hsk-cli')
    parser.add_argument('--save-key', action='store_true', help='Save provided environment key in HSK credential store')
    args = parser.parse_args()
    key = os.environ.get('HSK_API_KEY', '')

    def run(command, payload=None, receipt=None):
        process = subprocess.run([args.cli] + command + ['--format', 'json'],
                                 input=json.dumps(payload) if payload else None,
                                 capture_output=True, text=True)
        # HSK native business commands write their result on the first stdout line.
        # Setup doctor may return pretty JSON; accept that without treating stderr logs as failure.
        try:
            result = json.loads(process.stdout.splitlines()[0])
        except (ValueError, IndexError):
            try:
                result = json.loads(process.stdout)
            except ValueError:
                raise SystemExit('HSK did not return a JSON result; inspect CLI readiness')
        if not isinstance(result, dict):
            raise SystemExit('HSK returned an invalid result')
        sanitized = json.dumps(result, ensure_ascii=False, indent=2)
        if key:
            sanitized = sanitized.replace(key, '[REDACTED]')
        # Keep the first business receipt even if the npm wrapper subsequently fails.
        # An uploaded resource must be inspected rather than accidentally uploaded twice.
        if receipt:
            receipt.write_text(sanitized + '\n')
        native_success = (result.get('success') is None and result.get('public_url')
                          and result.get('resource_id') and result.get('code', 0) == 0)
        if process.returncode or not (result.get('success') is True or native_success):
            raise SystemExit(sanitized)
        return result

    doctor = run(['doctor'])
    if not doctor['success']:
        raise SystemExit('HSK is not ready')
    wizard = run(['context', 'wizard'])
    answers = []
    desired = {'task_goal': 'share_file', 'agent_channel': 'rich', 'persistence': 'unknown'}
    for question in wizard['data'].get('ask', []):
        value = desired.get(question['field'])
        if value not in question.get('options', []):
            raise SystemExit('New wizard question needs an agent answer: ' + question['field'])
        answers.append({'field': question['field'], 'value': value})
    if answers:
        wizard = run(['context', 'wizard', '--stdin'],
                     {'schema_version': wizard['data']['schema_version'], 'answers': answers})
    recommendations = wizard['data'].get('recommendations', [])
    if not any('file-hosting' in recommendation.get('next', '') for recommendation in recommendations):
        raise SystemExit('Wizard does not recommend static file hosting')
    if args.save_key:
        if not key:
            raise SystemExit('HSK_API_KEY is required for --save-key')
        run(['api-key', 'set', '--scene', 'file_hosting', '--key', key])
    channel = wizard['data'].get('claim_channel', {})
    if not key and not channel.get('api_key_configured') and not channel.get('logged_in'):
        raise SystemExit('No HSK credential available; provide HSK_API_KEY or authenticate before publishing')
    release = json.loads((ROOT / 'releases/latest.json').read_text())
    site = Path(release['site']).resolve()
    if not site.is_relative_to(ROOT / 'releases') or not (site / 'index.html').is_file():
        raise SystemExit('Invalid staged release')
    command = ['file-hosting', str(site), '--entry-file', 'index.html',
               '--context', 'task_goal=share_file,agent_channel=rich']
    if key:
        command += ['--api-key', key]
    result = run(command, receipt=site.parent / 'publication.json')
    data = result.get('data', result)
    if not isinstance(data, dict) or not (data.get('public_url', data.get('publicUrl'))
                                         and data.get('resource_id', data.get('resourceId'))):
        raise SystemExit('Upload receipt saved but missing URL or resource ID; inspect publication.json before retrying')
    serialized = json.dumps(result, ensure_ascii=False, indent=2)
    if key:
        serialized = serialized.replace(key, '[REDACTED]')
    (site.parent / 'publication.json').write_text(serialized + '\n')
    print(serialized)

if __name__ == '__main__':
    main()
