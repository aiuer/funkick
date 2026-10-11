/* Fetch versioned resources on HTTPS; keep a matching offline pack for file://. */
(function () {
  'use strict';
  const root = new URL('assets/yuanxin/', document.baseURI);
  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = url;
      script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
  }
  async function getJSON(url, fresh = false) {
    const response = await fetch(url, {cache: fresh ? 'no-store' : 'default', signal: AbortSignal.timeout(6000)});
    if (!response.ok) throw new Error('Resource unavailable');
    return response.json();
  }
  function localURL(value, base) {
    const url = new URL(value, base);
    if (!url.href.startsWith(root.href)) throw new Error('Asset outside theme directory');
    return url.href;
  }
  function apply(manifest, base) {
    if (manifest.schema_version !== 1 || manifest.theme !== 'yuanxin' || !manifest.photos?.length)
      throw new Error('Invalid theme manifest');
    const ids = new Set();
    const photos = manifest.photos.map(photo => {
      if (!photo.id || ids.has(photo.id)) throw new Error('Invalid photo ID');
      ids.add(photo.id);
      const effects = {};
      for (const [mode, effect] of Object.entries(photo.effects || {})) {
        effects[mode] = {...effect, media: localURL(effect.media, base), poster: localURL(effect.poster, base)};
      }
      return {...photo, data: photo.data || localURL(photo.image, base),
        thumbnail: photo.data || localURL(photo.thumbnail, base), effects};
    });
    window.THEME_PACKS = window.THEME_PACKS || {};
    window.THEME_PACKS.yuanxin = {...manifest, photos, count: photos.length,
      desc: '主题图集 · ' + photos.length + ' 张合影'};
  }
  async function offline() {
    await loadScript(new URL('current.js', root));
    const version = window.YUANXIN_CURRENT.version;
    if (!/^v-[a-f0-9]{16}$/.test(version)) throw new Error('Invalid theme version');
    const base = new URL(version + '/', root);
    await loadScript(new URL('offline.js', base));
    apply(window.YUANXIN_OFFLINE, base);
  }
  window.loadYuanxinResources = async function () {
    try {
      if (location.protocol === 'file:') { await offline(); return; }
      const current = await getJSON(new URL('current.json', root), true);
      const manifestURL = localURL(current.manifest, root);
      const manifest = await getJSON(manifestURL);
      if (manifest.version !== current.version) throw new Error('Version mismatch');
      apply(manifest, new URL('./', manifestURL));
    } catch (_) {
      try { await offline(); } catch (_) { /* Existing embedded pack remains playable. */ }
    }
  };
})();
