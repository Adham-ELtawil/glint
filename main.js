// Progressive enhancement only: every link already works without JS.
(function () {
  var REPO = "Adham-ELtawil/glint";
  var ua = navigator.userAgent || "";
  var platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  var isWindows = /win/i.test(platform) || /Windows/i.test(ua);
  var isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

  var note = document.getElementById("os-note");
  var label = document.getElementById("download-label");
  if (!isWindows && note) {
    note.hidden = false;
    if (label) label.textContent = isMobile ? "Get Glint for your Windows PC" : "Download for Windows";
  }

  // Ask GitHub for the latest release so the button can point straight at the installer.
  if (!window.fetch) return;
  fetch("https://api.github.com/repos/" + REPO + "/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
    .then(function (rel) {
      if (!rel || typeof rel.tag_name !== "string" || !rel.tag_name) return;
      var exe = (rel.assets || []).filter(function (a) { return /_x64-setup\.exe$/i.test(a.name); })[0];
      var version = document.getElementById("dl-version");
      if (version && rel.tag_name) version.textContent = "Version " + rel.tag_name.replace(/^v/, "");
      if (!exe || !exe.browser_download_url || !rel.html_url || typeof exe.size !== "number" || !isFinite(exe.size) || exe.size < 0) return;
      var mb = (exe.size / 1e6).toFixed(1);
      var meta = document.getElementById("download-meta");
      if (meta) {
        meta.textContent = "Version " + rel.tag_name.replace(/^v/, "") + " · 64-bit installer, " + mb + " MB · no admin rights needed · ";
        var a = document.createElement("a");
        a.href = rel.html_url; a.textContent = "Release notes";
        meta.appendChild(a);
      }
      var links = document.querySelectorAll("#download, .js-download");
      for (var i = 0; i < links.length; i++) links[i].href = exe.browser_download_url;
    })
    .catch(function () { /* keep the releases/latest fallback */ });
})();
