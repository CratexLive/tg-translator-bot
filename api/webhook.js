async function fetchWallpaperCaveImages(query) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];

  const searchUrl = `https://wallpapercave.com/search?q=${encodeURIComponent(cleanQuery)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(searchUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: "https://wallpapercave.com/",
      },
    });

    if (!res.ok) return [];
    const html = await res.text();

    const rawMatches =
      html.match(/https?:\/\/(?:images\.wallpapercave\.com|wallpapercave\.com)\/[^\s"'<>\\)]+\.(?:jpg|jpeg|png|webp)/gi) || [];

    const uniqueUrls = [...new Set(rawMatches.map((u) => u.replace(/\\+$/, "")))].filter(
      (u) => !/logo|avatar|icon|sprite|favicon/i.test(u)
    );

    return uniqueUrls.slice(0, 15).map((imgUrl, idx) => ({
      id: makeId("wp", "WALLPAPER", `${cleanQuery} ${idx + 1}`, imgUrl),
      source: "wallpapercave",
      title: `${cleanQuery.toUpperCase()} WALLPAPER ${idx + 1}`,
      status: "LIVE",
      metaLabel: "QUERY",
      metaValue: cleanQuery,
      imageUrl: imgUrl,
      searchText: `${cleanQuery} wallpaper`.toLowerCase(),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
