const repo = "radcolor/sky_cotl_clock";
const releasesUrl = `https://github.com/${repo}/releases/latest`;
const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
const currentVersion = "0.1.6";

const downloadButton = document.querySelector("#downloadButton");
const alternateDownloadLink = document.querySelector("#alternateDownloadLink");
const packageVersion = document.querySelector("#packageVersion");
const cursorLight = document.querySelector(".cursor-light");
const previewVideo = document.querySelector(".app-window video");
const themeToggle = document.querySelector(".theme-toggle");
const themeToggleText = document.querySelector(".theme-toggle-text");
const navLinks = [...document.querySelectorAll("nav a")];
const sectionNavLinks = navLinks.filter((link) =>
  link.getAttribute("href")?.startsWith("#"),
);
const sections = sectionNavLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

packageVersion.textContent = currentVersion;

function getCurrentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function setTheme(theme, persist = true) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;

  if (persist) {
    try {
      localStorage.setItem("isekai-docs-theme", nextTheme);
    } catch {}
  }

  if (!themeToggle || !themeToggleText) {
    return;
  }

  const isDark = nextTheme === "dark";
  themeToggle.setAttribute("aria-pressed", String(isDark));
  themeToggle.setAttribute("aria-label", `Switch to ${isDark ? "light" : "dark"} theme`);
  themeToggleText.textContent = isDark ? "Light" : "Dark";
}

function isMacOS() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  const userAgent = navigator.userAgent || "";

  return /mac/i.test(platform) || /Macintosh|Mac OS X/i.test(userAgent);
}

function chooseDownloadAsset(assets, platform) {
  const preferredExtensions =
    platform === "macos" ? [".dmg"] : [".msi", ".exe", ".zip"];

  return preferredExtensions
    .map((extension) =>
      assets.find((asset) => asset.name.toLowerCase().endsWith(extension)),
    )
    .find(Boolean);
}

async function hydrateLatestRelease() {
  const preferredPlatform = isMacOS() ? "macos" : "windows";
  const alternatePlatform = preferredPlatform === "macos" ? "windows" : "macos";

  try {
    const response = await fetch(apiUrl, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!response.ok) {
      throw new Error(`GitHub responded with ${response.status}`);
    }

    const release = await response.json();
    const assets = release.assets || [];
    const asset = chooseDownloadAsset(assets, preferredPlatform);
    const alternateAsset = chooseDownloadAsset(assets, alternatePlatform);
    const version = release.tag_name || `v${currentVersion}`;

    if (asset) {
      downloadButton.href = asset.browser_download_url;
      downloadButton.querySelector("span").textContent =
        preferredPlatform === "macos" ? `Download macOS ${version}` : `Download Windows ${version}`;
    } else {
      downloadButton.href = release.html_url || releasesUrl;
      downloadButton.querySelector("span").textContent = `View ${version}`;
    }

    if (alternateDownloadLink) {
      alternateDownloadLink.href = alternateAsset?.browser_download_url || release.html_url || releasesUrl;
      alternateDownloadLink.textContent =
        alternatePlatform === "windows" ? "Download for Windows" : "Download for macOS";
    }
  } catch (error) {
    downloadButton.href = releasesUrl;
    downloadButton.querySelector("span").textContent = "Download latest version";

    if (alternateDownloadLink) {
      alternateDownloadLink.href = releasesUrl;
      alternateDownloadLink.textContent = "Download for Windows";
    }
  }
}

function startPreviewVideo() {
  if (!previewVideo) {
    return;
  }

  previewVideo.muted = true;
  previewVideo.loop = true;
  previewVideo.play().catch(() => {});
  previewVideo.addEventListener("ended", () => {
    previewVideo.currentTime = 0;
    previewVideo.play().catch(() => {});
  });
}

function setActiveNav() {
  let current;

  sections.forEach((section) => {
    if (section.getBoundingClientRect().top <= 150) {
      current = section;
    }
  });

  sectionNavLinks.forEach((link) => {
    const isActive = current && link.getAttribute("href") === `#${current.id}`;
    link.classList.toggle("active", Boolean(isActive));
  });
}

document.querySelectorAll("[data-reveal]").forEach((element) => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 },
  );

  observer.observe(element);
});

document.querySelectorAll("details").forEach((details) => {
  details.addEventListener("toggle", () => {
    if (!details.open) {
      return;
    }

    document.querySelectorAll("details").forEach((other) => {
      if (other !== details) {
        other.open = false;
      }
    });
  });
});

themeToggle?.addEventListener("click", () => {
  setTheme(getCurrentTheme() === "dark" ? "light" : "dark");
});

document.addEventListener("pointermove", (event) => {
  cursorLight.style.opacity = "1";
  cursorLight.style.transform = `translate(${event.clientX - 180}px, ${event.clientY - 180}px)`;
});

document.addEventListener("pointerleave", () => {
  cursorLight.style.opacity = "0";
});

document.addEventListener("scroll", setActiveNav, { passive: true });

setTheme(getCurrentTheme(), false);
hydrateLatestRelease();
startPreviewVideo();
setActiveNav();
