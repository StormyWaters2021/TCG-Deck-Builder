import "./styles.css";
import React, { useEffect, useRef, useState } from "react";
import DeckBuilder from "./DeckBuilder";
import MobileDeckBuilder from "./mobile/MobileDeckBuilder";
import { useLayoutMode } from "./mobile/layoutMode";
import { loadCardsForGame } from "./utils/cardsLoader";
import { newsArticles } from "./newsArticles";

const LAST_GAME_KEY = "tcgbuilder:lastGame";

function sortCardsByNameThenSubtitle(cards) {
  return [...cards].sort((a, b) => {
    const an = String(a?.name ?? "");
    const bn = String(b?.name ?? "");
    const cmp = an.localeCompare(bn, undefined, { sensitivity: "base", numeric: true });
    if (cmp !== 0) return cmp;

    // tiebreak on Subtitle (handles both "Subtitle" and "subtitle")
    const asub = String(a?.Subtitle ?? a?.subtitle ?? "");
    const bsub = String(b?.Subtitle ?? b?.subtitle ?? "");
    return asub.localeCompare(bsub, undefined, { sensitivity: "base", numeric: true });
  });
}

function LinearProgress({ done, total }) {
   const pct = total > 0 ? Math.round((done / total) * 100) : 0;
   return (
     <div style={{ width: 360, maxWidth: "90vw" }}>
       <div style={{
         height: 10,
         background: "rgba(255,255,255,0.15)",
         borderRadius: 6,
         overflow: "hidden",
         boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.1)"
       }}
         role="progressbar"
         aria-valuenow={pct}
         aria-valuemin={0}
         aria-valuemax={100}
       >
         <div style={{
           width: `${pct}%`,
           height: "100%",
           background: "currentColor",
           opacity: 0.85,
           transition: "width 200ms ease"
         }} />
       </div>
       <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8, textAlign: "center" }}>
         {total > 1 ? `Loading sets ${done}/${total} (${pct}%)` : "Loading data..."}
       </div>
     </div>
   );
 }

const fetchGames = async () => {
  const gamesManifest = await fetch(
    `${import.meta.env.BASE_URL}games/manifest.json`
  ).then((res) => res.json());
  return gamesManifest.games;
};

// Parses the deck string from URL into deck object your app can use
function parseDeckString(deckStr) {
  const deck = {};
  if (!deckStr) return deck;

  deckStr.split(";").forEach((entry) => {
    if (!entry.trim()) return;
    const parts = entry.split(":");
    const id = parts[0];
    const ctTags = parts[1] || "";
    const groupName = parts[2] || undefined;

    // first number = count; rest = tags
    const segs = ctTags.split(",").filter((s) => s);
    const count = parseInt(segs[0], 10) || 0;
    const tags = segs.slice(1);

    deck[id] = { count };
    if (tags.length) deck[id].tags = tags;
    if (groupName) deck[id].group = decodeURIComponent(groupName);
  });

  return deck;
}

// Get the default groupBy option from settings, only allowing OCTGN if it's valid.
// If the first option is "OCTGN" and octgnExport is not true, use the next option.
function getDefaultGroupBy(settings) {
  if (!settings || !settings.groupOptions || !Array.isArray(settings.groupOptions))
    return "Type"; // fallback

  if (settings.groupOptions[0] === "OCTGN" && settings.octgnExport !== true) {
    // Use the next option if available, otherwise fallback
    return settings.groupOptions[1] || "Type";
  }

  // Otherwise, use the first option
  return settings.groupOptions[0] || "Type";
}

function formatArticleDate(dateText) {
  if (!dateText) return "";

  const date = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateText;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getNewsInlineImageUrl(block) {
  if (!block) return "";

  if (block.url) {
    return block.url;
  }

  if (block.game && block.image) {
    return `https://tcgbuilder.net/images/${block.game}/${block.image}`;
  }

  return "";
}

function NewsPage() {
  const [selectedSlug, setSelectedSlug] = useState(null);
  const selectedArticle = newsArticles.find((article) => article.slug === selectedSlug);
  const featuredArticle = newsArticles[0];
  const remainingArticles = newsArticles.slice(1);

  if (selectedArticle) {
    return (
      <main className="news-page">
        <button
          className="news-back-link"
          type="button"
          onClick={() => setSelectedSlug(null)}
        >
          ← Back to News
        </button>

        <article className="news-article-detail">
          <div className="news-article-meta">
            {formatArticleDate(selectedArticle.date)}
            {selectedArticle.author ? ` • ${selectedArticle.author}` : ""}
          </div>

          <h2>{selectedArticle.title}</h2>

          {selectedArticle.tags?.length > 0 && (
            <div className="news-tag-row">
              {selectedArticle.tags.map((tag) => (
                <span key={tag} className="news-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {selectedArticle.body.map((block, index) => {
		  if (typeof block === "string") {
			return <p key={index}>{block}</p>;
		  }

		  if (block.type === "paragraph") {
			return <p key={index}>{block.text}</p>;
		  }

		  if (block.type === "image") {
			const imageUrl = getNewsInlineImageUrl(block);

			if (!imageUrl) return null;

			return (
			  <figure key={index} className="news-inline-image-wrap">
				<img
				  className="news-inline-image"
				  src={imageUrl}
				  alt={block.alt || selectedArticle.title}
				  loading="lazy"
				/>

				{block.caption && (
				  <figcaption>{block.caption}</figcaption>
				)}
			  </figure>
			);
		  }

		  return null;
		})}
        </article>
      </main>
    );
  }

  return (
    <main className="news-page">
      <section className="news-hero">
        <div>
          <div className="news-eyebrow">TCGBuilder.net News</div>
          <h2>Latest updates, articles, and development notes</h2>
          <p>
            Check here for news, updates, etc.
          </p>
        </div>
      </section>

      {featuredArticle && (
        <section className="news-featured-card">
          <div className="news-article-meta">
            {formatArticleDate(featuredArticle.date)}
            {featuredArticle.author ? ` • ${featuredArticle.author}` : ""}
          </div>

          <h3>{featuredArticle.title}</h3>
          <p>{featuredArticle.excerpt}</p>

          <button
            className="news-read-button"
            type="button"
            onClick={() => setSelectedSlug(featuredArticle.slug)}
          >
            Read Article
          </button>
        </section>
      )}

      <section className="news-article-grid" aria-label="News articles">
        {remainingArticles.map((article) => (
          <article key={article.slug} className="news-card">
            <div className="news-article-meta">
              {formatArticleDate(article.date)}
              {article.author ? ` • ${article.author}` : ""}
            </div>

            <h3>{article.title}</h3>
            <p>{article.excerpt}</p>

            {article.tags?.length > 0 && (
              <div className="news-tag-row">
                {article.tags.map((tag) => (
                  <span key={tag} className="news-tag">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <button
              className="news-card-link"
              type="button"
              onClick={() => setSelectedSlug(article.slug)}
            >
              Read more →
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}


function App() {
  const headerRef = useRef(null);
  const { isMobileLayout, toggleLayout, hasUserOverride } = useLayoutMode();

  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState("");
  const [gameData, setGameData] = useState({ settings: null, cards: [], allCards: [] });
  const [deck, setDeck] = useState({});
  const [loadProgress, setLoadProgress] = useState({ done: 0, total: 0 });
  const [loadError, setLoadError] = useState(null);

  // For light/dark mode toggle, initialize from localStorage or default false (dark)
  const [isLightMode, setIsLightMode] = useState(() => {
    const saved = localStorage.getItem("lightMode");
    return saved === "true";
  });

  // --- SHARED STATE for grouping and overrides ---
  const [groupBy, setGroupBy] = useState("Type");
  const [octgnOverrides, setOctgnOverrides] = useState({});

const [activePage, setActivePage] = useState(() => {
  const params = new URLSearchParams(window.location.search);
  return params.get("page") === "news" ? "news" : "builder";
});

  // Apply mode class and persist choice
  useEffect(() => {
    if (isLightMode) {
      document.body.classList.add("light-mode");
    } else {
      document.body.classList.remove("light-mode");
    }
    localStorage.setItem("lightMode", isLightMode);
  }, [isLightMode]);

useEffect(() => {
  const handlePopState = () => {
    const params = new URLSearchParams(window.location.search);
    setActivePage(params.get("page") === "news" ? "news" : "builder");
  };

  window.addEventListener("popstate", handlePopState);
  return () => window.removeEventListener("popstate", handlePopState);
}, []);

const goToNews = () => {
  const url = new URL(window.location);
  url.searchParams.set("page", "news");
  window.history.pushState({}, "", url.toString());
  setActivePage("news");
};

const goToBuilder = () => {
  const url = new URL(window.location);
  url.searchParams.delete("page");
  window.history.pushState({}, "", url.toString());
  setActivePage("builder");
};

  // Expose header height as a CSS variable so mobile sticky elements can offset correctly.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const setVar = () => {
      const h = Math.round(el.getBoundingClientRect().height || 0);
      document.documentElement.style.setProperty("--app-header-height", `${h}px`);
    };

    setVar();
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => setVar());
      ro.observe(el);
    } else {
      window.addEventListener("resize", setVar);
    }
    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", setVar);
    };
  }, []);

  // Load games manifest once
  useEffect(() => {
    fetchGames().then(setGames);
  }, []);

  // Parse URL params on mount for initial selected game only
  useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const urlGame = params.get("game");

  if (urlGame) {
    // URL always wins (deck links, shared links, bookmarks)
    setSelectedGame(urlGame);
    return;
  }

  // No URL game → restore last remembered game
  const lastGame = localStorage.getItem(LAST_GAME_KEY);
  if (lastGame) {
    setSelectedGame(lastGame);
  }
}, []);


useEffect(() => {
  if (!selectedGame) return;

  const params = new URLSearchParams(window.location.search);
  const urlGame = params.get("game");

  // If this game was set via URL, do NOT remember it
  if (urlGame === selectedGame) return;

  localStorage.setItem(LAST_GAME_KEY, selectedGame);

}, [selectedGame]);


  // When selectedGame changes, fetch game data
  useEffect(() => {
    if (!selectedGame) return;

    setGameData({ settings: null, cards: [], allCards: [] });

    (async () => {
      // Load settings + deckValidation
      const [settings, deckValidation] = await Promise.all([
        fetch(`${import.meta.env.BASE_URL}games/${selectedGame}/settings.json`).then((r) =>
          r.json()
        ),
        fetch(
          `${import.meta.env.BASE_URL}games/${selectedGame}/deckValidation.json`
        ).then((r) => r.json()),
      ]);

            // Reset progress + load cards with progress callback
			setLoadProgress({ done: 0, total: 0 });
			setLoadError(null);

			try {
			  // 1) Load EVERYTHING
			  const allCards = await loadCardsForGame(selectedGame, (done, total) => {
				setLoadProgress({ done, total });
			  });

			  // 2) Filter for UI using settings.hiddenSets (by set_id)
			  const hidden = new Set((settings.hiddenSets || []).map((s) => String(s)));
			  const visibleCards = allCards.filter((c) => !hidden.has(String(c?.set_id ?? "")));

			  setGameData({
				settings: { ...settings, deckValidation },
				cards: sortCardsByNameThenSubtitle(visibleCards),   // UI uses this
				allCards: sortCardsByNameThenSubtitle(allCards),    // exporter can use this
			  });
			} catch (err) {
			  console.error(err);
			  setGameData({ settings: { ...settings, deckValidation }, cards: [], allCards: [] });
			  setLoadError(err?.message || String(err));
			}
    })();

    setDeck({}); // Clear deck on game change to avoid conflicts
    setGroupBy("Type");
    setOctgnOverrides({});
  }, [selectedGame]);

  // After game settings are loaded, set groupBy to the first valid group option
  useEffect(() => {
    if (!gameData.settings) return;
    setGroupBy(getDefaultGroupBy(gameData.settings));
  }, [gameData.settings]);

  const handleGameClick = (game) => {
  if (Object.keys(deck).length > 0 && game !== selectedGame) {
    if (!window.confirm("Switching games will erase your current deck. Continue?")) return;
    setDeck({});
  }

  setSelectedGame(game);
};


  const handleBackToSelect = () => {
    if (Object.keys(deck).length > 0) {
      const confirmed = window.confirm("All current progress will be lost! Continue?");
      if (!confirmed) return;
    }
    setDeck({});
    setSelectedGame("");
    setGameData({ settings: null, cards: [], allCards: [] });
    setGroupBy("Type");
    setOctgnOverrides({});

	localStorage.removeItem(LAST_GAME_KEY);

    // Clear the URL params to avoid reloading game from URL on next render
    const url = new URL(window.location);
    url.searchParams.delete("game");
    url.searchParams.delete("deck");
	url.searchParams.delete("page");
    window.history.replaceState({}, "", url.toString());
  };

  return (
    <div className="app-container">
      <header
  className="app-header"
  ref={headerRef}
  style={{
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center", // center the title
    padding: "1rem",
  }}
>
  {/* Left side: Back button (pinned to left) */}
<div style={{ position: "absolute", left: "1rem" }}>
  {activePage === "news" ? (
    <button className="back-button" onClick={goToBuilder}>
      Builder
    </button>
  ) : (
    selectedGame && (
      <button className="back-button" onClick={handleBackToSelect}>
        Back
      </button>
    )
  )}
</div>

  {/* Center: Title (no absolute positioning now) */}
 <div className="app-brand-row">
  <h1
    className="app-title"
    style={{
      fontSize: isMobileLayout ? "1.4rem" : undefined,
      maxWidth: isMobileLayout ? "52vw" : undefined,
    }}
  >
    TCGBuilder.net
  </h1>

  <button
    className={`news-nav-button${activePage === "news" ? " active" : ""}`}
    type="button"
    onClick={goToNews}
    aria-current={activePage === "news" ? "page" : undefined}
    title="News"
  >
    <span aria-hidden="true" className="news-nav-icon">⚠️📰⚠️</span>
    <span>News</span>
  </button>
</div>

  {/* Right side: toggles (pinned to right, close together) */}
  <div
  style={{
    position: "absolute",
    right: "1rem",
    display: "flex",
    alignItems: "center",
    gap: 2, // tighter space between the two icons
  }}
>
  <button
    onClick={toggleLayout}
    aria-label={
      isMobileLayout ? "Switch to desktop layout" : "Switch to mobile layout"
    }
    style={{
      cursor: "pointer",
      background: "transparent",
      border: "none",
      fontSize: "1.35rem",
      color: "inherit",
      userSelect: "none",
      opacity: hasUserOverride ? 1 : 0.85,
      padding: 0,   // <— remove default padding
      margin: 0,    // <— remove any margin
    }}
    type="button"
    title={
      isMobileLayout ? "Switch to desktop layout" : "Switch to mobile layout"
    }
  >
    {isMobileLayout ? "🖥️" : "📱"}
  </button>
  <button
    onClick={() => setIsLightMode((prev) => !prev)}
    aria-label={isLightMode ? "Switch to dark mode" : "Switch to light mode"}
    style={{
      cursor: "pointer",
      background: "transparent",
      border: "none",
      fontSize: "1.5rem",
      color: "inherit",
      userSelect: "none",
      padding: 0,   // <— remove default padding
      margin: 0,    // <— remove any margin
    }}
    type="button"
    title={isLightMode ? "Switch to dark mode" : "Switch to light mode"}
  >
    {isLightMode ? "🌙" : "☀️"}
  </button>
    <button
    onClick={() =>
      window.open("https://buymeacoffee.com/tcgbuilder", "_blank", "noopener,noreferrer")
    }
    aria-label="Support TCG Builder on Buy Me a Coffee"
    style={{
      cursor: "pointer",
      background: "transparent",
      border: "none",
      fontSize: "1.5rem",
      color: "inherit",
      userSelect: "none",
      padding: 0,
      margin: 0,
    }}
    type="button"
    title="Buy me a coffee"
  >
    ☕
  </button>
</div>

</header>


{activePage === "news" && <NewsPage />}

      {activePage !== "news" && !selectedGame && (
        <div className="game-grid">
          {games.map((game) => (
            <div key={game} className="game-card" onClick={() => handleGameClick(game)}>
              <img
                src={`${import.meta.env.BASE_URL}games/${game}/art/logo.jpg`}
                alt={game}
                className="game-logo"
              />
            </div>
          ))}
        </div>
      )}

      {activePage !== "news" && selectedGame && (!gameData.cards || gameData.cards.length === 0) && (
   <div className="loading-container" style={{ display: "grid", placeItems: "center", minHeight: 200 }}>
     {loadError ? (
       <div style={{ color: "crimson", textAlign: "center" }}>{loadError}</div>
     ) : (
       <LinearProgress done={loadProgress.done} total={loadProgress.total} />
     )}
   </div>
 )}

      {activePage !== "news" && selectedGame && gameData.settings && gameData.cards.length > 0 && (
        isMobileLayout ? (
          <MobileDeckBuilder
            game={selectedGame}
            settings={gameData.settings}
            cards={gameData.cards}
			allCards={gameData.allCards}
            deck={deck}
            setDeck={setDeck}
            setGame={setSelectedGame}
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            octgnOverrides={octgnOverrides}
            setOctgnOverrides={setOctgnOverrides}
          />
        ) : (
          <DeckBuilder
            game={selectedGame}
            settings={gameData.settings}
            cards={gameData.cards}
			allCards={gameData.allCards}
            deck={deck}
            setDeck={setDeck}
            setGame={setSelectedGame}
            // --- Pass groupBy and octgnOverrides and their setters ---
            groupBy={groupBy}
            setGroupBy={setGroupBy}
            octgnOverrides={octgnOverrides}
            setOctgnOverrides={setOctgnOverrides}
          />
        )
      )}
    </div>
  );
}

export default App;
