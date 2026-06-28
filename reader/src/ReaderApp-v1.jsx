import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { BookOpen, Upload, Sun, Moon, ScrollText, FileText, Highlighter, X, Play, Pause, Square, ChevronLeft, ChevronRight, Trash2, StickyNote, Volume2, Library, ArrowLeft } from "lucide-react";

const STORAGE_KEYS = {
  library: "library:index",
  bookContent: (id) => `book:${id}:content`,
  highlights: (id) => `highlights:${id}`,
  prefs: "prefs:global",
};

const HIGHLIGHT_COLORS = [
  { id: "amber", label: "Amber", hex: "#D9A441" },
  { id: "rose", label: "Rose", hex: "#C97A65" },
  { id: "sage", label: "Sage", hex: "#7C9070" },
  { id: "slate", label: "Slate", hex: "#7A8699" },
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- Parsers ----------

async function parseTxt(file) {
  const text = await file.text();
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return {
    title: file.name.replace(/\.txt$/i, ""),
    author: "",
    chapters: [{ title: "Full text", paragraphs }],
  };
}

async function parsePdf(file, pdfjsLib) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const paragraphs = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => it.str);
    const pageText = strings.join(" ").replace(/\s+/g, " ").trim();
    if (pageText) {
      // Split long page text into pseudo-paragraphs for readability
      const chunks = pageText.match(/[^.!?]+[.!?]+(\s|$)/g) || [pageText];
      let buffer = "";
      const pageParas = [];
      chunks.forEach((c) => {
        buffer += c;
        if (buffer.length > 400) {
          pageParas.push(buffer.trim());
          buffer = "";
        }
      });
      if (buffer.trim()) pageParas.push(buffer.trim());
      paragraphs.push({ pageNum: i, paragraphs: pageParas });
    }
  }
  let meta = {};
  try {
    meta = (await pdf.getMetadata()).info || {};
  } catch (e) {}
  return {
    title: meta.Title || file.name.replace(/\.pdf$/i, ""),
    author: meta.Author || "",
    chapters: paragraphs.map((p) => ({ title: `Page ${p.pageNum}`, paragraphs: p.paragraphs })),
  };
}

async function parseEpub(file, JSZip) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  // Find container.xml to locate the OPF file
  const containerXml = await zip.file("META-INF/container.xml").async("text");
  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, "application/xml");
  const opfPath = containerDoc.querySelector("rootfile").getAttribute("full-path");
  const opfDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";

  const opfText = await zip.file(opfPath).async("text");
  const opfDoc = parser.parseFromString(opfText, "application/xml");

  function findMetaText(doc, localName) {
    const all = doc.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const tag = el.tagName.includes(":") ? el.tagName.split(":").pop() : el.tagName;
      if (tag.toLowerCase() === localName && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return "";
  }

  const title = findMetaText(opfDoc, "title") || file.name.replace(/\.epub$/i, "");
  const author = findMetaText(opfDoc, "creator");

  const manifestItems = {};
  opfDoc.querySelectorAll("manifest item").forEach((item) => {
    manifestItems[item.getAttribute("id")] = item.getAttribute("href");
  });

  const spineIds = Array.from(opfDoc.querySelectorAll("spine itemref")).map((it) => it.getAttribute("idref"));
  const chapters = [];

  for (const id of spineIds) {
    const href = manifestItems[id];
    if (!href) continue;
    const fullPath = opfDir + href;
    const fileEntry = zip.file(fullPath) || zip.file(decodeURIComponent(fullPath));
    if (!fileEntry) continue;
    const html = await fileEntry.async("text");
    const doc = parser.parseFromString(html, "text/html");
    doc.querySelectorAll("script, style").forEach((el) => el.remove());
    const headingEl = doc.querySelector("h1, h2");
    const chapterTitle = headingEl?.textContent?.trim() || doc.querySelector("title")?.textContent?.trim() || `Chapter ${chapters.length + 1}`;
    if (headingEl) headingEl.remove();
    const blocks = Array.from(doc.querySelectorAll("p, h1, h2, h3, blockquote, li"))
      .map((el) => el.textContent.replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 0);
    if (blocks.length > 0) {
      chapters.push({ title: chapterTitle, paragraphs: blocks });
    }
  }

  if (chapters.length === 0) {
    chapters.push({ title: "Content", paragraphs: ["This EPUB could not be parsed into readable text."] });
  }

  return { title, author, chapters };
}

// ---------- Library loading screen ----------

function useScriptOnce(src, globalCheck) {
  const [ready, setReady] = useState(() => globalCheck());
  useEffect(() => {
    if (ready) return;
    if (globalCheck()) {
      setReady(true);
      return;
    }
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => setReady(true));
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => setReady(true);
    document.body.appendChild(script);
  }, [ready, src, globalCheck]);
  return ready;
}

export default function ReaderApp() {
  const [view, setView] = useState("library"); // library | reading | highlights
  const [library, setLibrary] = useState([]);
  const [activeBookId, setActiveBookId] = useState(null);
  const [activeBookContent, setActiveBookContent] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [prefs, setPrefs] = useState({ theme: "light", scrollMode: "paginated", fontSize: 18, voiceName: null, rate: 1 });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [selection, setSelection] = useState(null); // {text, range info}
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voices, setVoices] = useState([]);
  const [readingProgress, setReadingProgress] = useState({});
  const [noteEditing, setNoteEditing] = useState(null);
  const [storageReady, setStorageReady] = useState(false);

  const readerRef = useRef(null);
  const utterRef = useRef(null);
  const fileInputRef = useRef(null);

  const pdfReady = useScriptOnce(
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    () => typeof window.pdfjsLib !== "undefined"
  );
  const zipReady = useScriptOnce(
    "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
    () => typeof window.JSZip !== "undefined"
  );

  useEffect(() => {
    if (pdfReady && window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }
  }, [pdfReady]);

  // Load library index + prefs on mount
  useEffect(() => {
    (async () => {
      try {
        const idx = await window.storage.get(STORAGE_KEYS.library);
        if (idx) setLibrary(JSON.parse(idx.value));
      } catch (e) {}
      try {
        const p = await window.storage.get(STORAGE_KEYS.prefs);
        if (p) setPrefs((prev) => ({ ...prev, ...JSON.parse(p.value) }));
      } catch (e) {}
      setStorageReady(true);
    })();
  }, []);

  // Persist prefs
  useEffect(() => {
    if (!storageReady) return;
    window.storage.set(STORAGE_KEYS.prefs, JSON.stringify(prefs)).catch(() => {});
  }, [prefs, storageReady]);

  // Voices for TTS
  useEffect(() => {
    function loadVoices() {
      const v = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      setVoices(v);
      if (v.length && !prefs.voiceName) {
        setPrefs((p) => ({ ...p, voiceName: v[0].name }));
      }
    }
    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []); // eslint-disable-line

  const saveLibraryIndex = useCallback(async (next) => {
    setLibrary(next);
    await window.storage.set(STORAGE_KEYS.library, JSON.stringify(next));
  }, []);

  const handleFiles = useCallback(
    async (files) => {
      setLoading(true);
      setLoadError(null);
      for (const file of Array.from(files)) {
        try {
          let parsed;
          const ext = file.name.split(".").pop().toLowerCase();
          if (ext === "txt") {
            parsed = await parseTxt(file);
          } else if (ext === "pdf") {
            if (!window.pdfjsLib) throw new Error("PDF engine still loading, try again in a moment.");
            parsed = await parsePdf(file, window.pdfjsLib);
          } else if (ext === "epub") {
            if (!window.JSZip) throw new Error("EPUB engine still loading, try again in a moment.");
            parsed = await parseEpub(file, window.JSZip);
          } else {
            throw new Error(`Unsupported file type: .${ext}`);
          }

          const id = uid();
          const meta = {
            id,
            title: parsed.title || file.name,
            author: parsed.author || "",
            format: ext,
            addedAt: Date.now(),
            chapterCount: parsed.chapters.length,
          };
          const serialized = JSON.stringify(parsed);
          if (serialized.length > 4.5 * 1024 * 1024) {
            throw new Error(
              `"${meta.title}" is too large to store (this book's text is over the 5MB limit). Try a shorter book or a plain .txt export for now.`
            );
          }
          await window.storage.set(STORAGE_KEYS.bookContent(id), serialized);
          setLibrary((prev) => {
            const next = [meta, ...prev];
            window.storage.set(STORAGE_KEYS.library, JSON.stringify(next)).catch(() => {});
            return next;
          });
        } catch (err) {
          setLoadError(err.message || "Could not load that file.");
        }
      }
      setLoading(false);
    },
    []
  );

  const openBook = useCallback(async (id) => {
    setLoading(true);
    setLoadError(null);
    try {
      const content = await window.storage.get(STORAGE_KEYS.bookContent(id));
      const parsed = JSON.parse(content.value);
      setActiveBookContent(parsed);
      setActiveBookId(id);

      let hl = [];
      try {
        const h = await window.storage.get(STORAGE_KEYS.highlights(id));
        hl = JSON.parse(h.value);
      } catch (e) {}
      setHighlights(hl);

      const savedChapter = readingProgress[id] || 0;
      setChapterIndex(Math.min(savedChapter, parsed.chapters.length - 1));
      setView("reading");
    } catch (err) {
      setLoadError("Could not open this book.");
    }
    setLoading(false);
  }, [readingProgress]);

  const deleteBook = useCallback(
    async (id) => {
      const next = library.filter((b) => b.id !== id);
      await saveLibraryIndex(next);
      try {
        await window.storage.delete(STORAGE_KEYS.bookContent(id));
        await window.storage.delete(STORAGE_KEYS.highlights(id));
      } catch (e) {}
      if (activeBookId === id) {
        setView("library");
        setActiveBookId(null);
        setActiveBookContent(null);
      }
    },
    [library, activeBookId, saveLibraryIndex]
  );

  const persistHighlights = useCallback(
    async (bookId, next) => {
      setHighlights(next);
      await window.storage.set(STORAGE_KEYS.highlights(bookId), JSON.stringify(next));
    },
    []
  );

  const handleTextSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setSelection(null);
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 1) {
      setSelection(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelection({ text, x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  const addHighlight = useCallback(
    (color) => {
      if (!selection || !activeBookId) return;
      const newHl = {
        id: uid(),
        bookId: activeBookId,
        chapterIndex,
        text: selection.text,
        color,
        note: "",
        createdAt: Date.now(),
      };
      const next = [newHl, ...highlights];
      persistHighlights(activeBookId, next);
      setSelection(null);
      window.getSelection().removeAllRanges();
    },
    [selection, activeBookId, chapterIndex, highlights, persistHighlights]
  );

  const removeHighlight = useCallback(
    (hlId) => {
      const next = highlights.filter((h) => h.id !== hlId);
      persistHighlights(activeBookId, next);
    },
    [highlights, activeBookId, persistHighlights]
  );

  const updateHighlightNote = useCallback(
    (hlId, note) => {
      const next = highlights.map((h) => (h.id === hlId ? { ...h, note } : h));
      persistHighlights(activeBookId, next);
    },
    [highlights, activeBookId, persistHighlights]
  );

  // Render chapter text with highlights wrapped in <mark>
  const renderedParagraphs = useMemo(() => {
    if (!activeBookContent) return [];
    const chapter = activeBookContent.chapters[chapterIndex];
    if (!chapter) return [];
    const chapterHls = highlights.filter((h) => h.chapterIndex === chapterIndex);

    return chapter.paragraphs.map((para, pIdx) => {
      let html = escapeHtml(para);
      chapterHls.forEach((h) => {
        const escaped = escapeHtml(h.text);
        if (html.includes(escaped)) {
          const colorHex = HIGHLIGHT_COLORS.find((c) => c.id === h.color)?.hex || "#D9A441";
          html = html.replace(
            escaped,
            `<mark data-hl-id="${h.id}" style="background:transparent;border-bottom:3px solid ${colorHex};padding-bottom:1px;cursor:pointer;" title="${h.note ? escapeHtml(h.note) : "Highlighted"}">${escaped}</mark>`
          );
        }
      });
      return { key: pIdx, html };
    });
  }, [activeBookContent, chapterIndex, highlights]);

  // Stop speech on unmount or book change
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, [activeBookId, chapterIndex]);

  const speakChapter = useCallback(() => {
    if (!window.speechSynthesis || !activeBookContent) return;
    window.speechSynthesis.cancel();
    const chapter = activeBookContent.chapters[chapterIndex];
    const fullText = chapter.paragraphs.join(" ");
    const utter = new window.SpeechSynthesisUtterance(fullText);
    const v = voices.find((vv) => vv.name === prefs.voiceName);
    if (v) utter.voice = v;
    utter.rate = prefs.rate;
    utter.onend = () => {
      setPlaying(false);
      setPaused(false);
    };
    utter.onerror = () => {
      setPlaying(false);
      setPaused(false);
    };
    utterRef.current = utter;
    window.speechSynthesis.speak(utter);
    setPlaying(true);
    setPaused(false);
  }, [activeBookContent, chapterIndex, voices, prefs.voiceName, prefs.rate]);

  const togglePause = useCallback(() => {
    if (!window.speechSynthesis) return;
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  }, [paused]);

  const stopSpeaking = useCallback(() => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
  }, []);

  const goToChapter = useCallback(
    (idx) => {
      stopSpeaking();
      setChapterIndex(idx);
      if (activeBookId) {
        setReadingProgress((p) => ({ ...p, [activeBookId]: idx }));
      }
      if (readerRef.current) readerRef.current.scrollTop = 0;
    },
    [activeBookId, stopSpeaking]
  );

  const isDark = prefs.theme === "dark";

  const theme = isDark
    ? {
        bg: "#1A1815",
        bgElevated: "#221F1A",
        text: "#E8E2D5",
        textMuted: "#A39B89",
        border: "#3A352C",
        accent: "#C97A65",
        accentText: "#1A1815",
      }
    : {
        bg: "#F7F3E9",
        bgElevated: "#FFFFFF",
        text: "#2B2620",
        textMuted: "#6B6253",
        border: "#E2D9C4",
        accent: "#8C3D2E",
        accentText: "#FFFFFF",
      };

  const serifFont = "'Source Serif 4', Georgia, 'Times New Roman', serif";
  const sansFont = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  // -------------- UI pieces --------------

  function TopBar({ children }) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 20px",
          borderBottom: `1px solid ${theme.border}`,
          background: theme.bgElevated,
          fontFamily: sansFont,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        {children}
      </div>
    );
  }

  function IconButton({ onClick, title, active, children, disabled }) {
    return (
      <button
        onClick={onClick}
        title={title}
        disabled={disabled}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 8,
          border: `1px solid ${active ? theme.accent : theme.border}`,
          background: active ? theme.accent : "transparent",
          color: active ? theme.accentText : theme.text,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          transition: "all 0.15s ease",
        }}
      >
        {children}
      </button>
    );
  }

  // -------------- Library view --------------

  function LibraryView() {
    return (
      <div style={{ minHeight: 500, fontFamily: sansFont, background: theme.bg, color: theme.text }}>
        <TopBar>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Library size={20} color={theme.accent} />
            <span style={{ fontSize: 17, fontWeight: 600, fontFamily: serifFont }}>Your shelf</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <IconButton title={isDark ? "Light mode" : "Night mode"} onClick={() => setPrefs((p) => ({ ...p, theme: isDark ? "light" : "dark" }))}>
              {isDark ? <Sun size={17} /> : <Moon size={17} />}
            </IconButton>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "0 14px",
                height: 36,
                borderRadius: 8,
                border: "none",
                background: theme.accent,
                color: theme.accentText,
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Upload size={15} /> Add book
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,.pdf,.txt"
              multiple
              style={{ display: "none" }}
              onChange={(e) => e.target.files.length && handleFiles(e.target.files)}
            />
          </div>
        </TopBar>

        <div style={{ padding: "24px 20px" }}>
          {loadError && (
            <div
              style={{
                padding: "10px 14px",
                background: isDark ? "#3A2420" : "#FBEAF0",
                border: `1px solid ${theme.accent}`,
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13.5,
                color: theme.text,
              }}
            >
              {loadError}
            </div>
          )}
          {loading && (
            <div style={{ fontSize: 13.5, color: theme.textMuted, marginBottom: 16 }}>Loading…</div>
          )}

          {library.length === 0 && !loading ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${theme.border}`,
                borderRadius: 12,
                padding: "60px 20px",
                textAlign: "center",
                cursor: "pointer",
                color: theme.textMuted,
              }}
            >
              <BookOpen size={32} style={{ marginBottom: 12, opacity: 0.6 }} />
              <div style={{ fontSize: 15, fontFamily: serifFont, marginBottom: 4, color: theme.text }}>
                Your shelf is empty
              </div>
              <div style={{ fontSize: 13 }}>Add an EPUB, PDF, or text file to start reading</div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gap: 18,
              }}
            >
              {library.map((book) => (
                <div key={book.id} style={{ position: "relative" }}>
                  <div
                    onClick={() => openBook(book.id)}
                    style={{
                      cursor: "pointer",
                      background: theme.bgElevated,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      padding: 16,
                      height: 170,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "inline-block",
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                          color: theme.accent,
                          fontWeight: 700,
                          marginBottom: 8,
                        }}
                      >
                        {book.format}
                      </div>
                      <div
                        style={{
                          fontFamily: serifFont,
                          fontSize: 15.5,
                          fontWeight: 600,
                          lineHeight: 1.3,
                          color: theme.text,
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {book.title}
                      </div>
                    </div>
                    {book.author && (
                      <div style={{ fontSize: 12, color: theme.textMuted }}>{book.author}</div>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteBook(book.id);
                    }}
                    title="Remove book"
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      border: "none",
                      background: "transparent",
                      color: theme.textMuted,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // -------------- Reading view --------------

  function ReadingView() {
    const activeMeta = library.find((b) => b.id === activeBookId);
    const chapters = activeBookContent?.chapters || [];
    const chapter = chapters[chapterIndex];

    return (
      <div style={{ minHeight: 500, background: theme.bg, color: theme.text, fontFamily: sansFont, position: "relative" }}>
        <TopBar>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <IconButton title="Back to shelf" onClick={() => { stopSpeaking(); setView("library"); }}>
              <ArrowLeft size={17} />
            </IconButton>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontFamily: serifFont,
                  fontWeight: 600,
                  fontSize: 14.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 220,
                }}
              >
                {activeMeta?.title}
              </div>
              <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                {chapter?.title} · {chapterIndex + 1} / {chapters.length}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setPrefs((p) => ({ ...p, fontSize: Math.max(13, p.fontSize - 1) }))}
                title="Smaller text"
                disabled={prefs.fontSize <= 13}
                style={{
                  width: 32,
                  height: 36,
                  border: "none",
                  borderRight: `1px solid ${theme.border}`,
                  background: "transparent",
                  color: theme.text,
                  cursor: prefs.fontSize <= 13 ? "not-allowed" : "pointer",
                  opacity: prefs.fontSize <= 13 ? 0.4 : 1,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                A−
              </button>
              <span
                style={{
                  width: 30,
                  textAlign: "center",
                  fontSize: 11.5,
                  color: theme.textMuted,
                }}
              >
                {prefs.fontSize}
              </span>
              <button
                onClick={() => setPrefs((p) => ({ ...p, fontSize: Math.min(32, p.fontSize + 1) }))}
                title="Larger text"
                disabled={prefs.fontSize >= 32}
                style={{
                  width: 32,
                  height: 36,
                  border: "none",
                  borderLeft: `1px solid ${theme.border}`,
                  background: "transparent",
                  color: theme.text,
                  cursor: prefs.fontSize >= 32 ? "not-allowed" : "pointer",
                  opacity: prefs.fontSize >= 32 ? 0.4 : 1,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                A+
              </button>
            </div>
            <IconButton
              title={prefs.scrollMode === "paginated" ? "Switch to continuous scroll" : "Switch to paginated"}
              onClick={() => setPrefs((p) => ({ ...p, scrollMode: p.scrollMode === "paginated" ? "scroll" : "paginated" }))}
            >
              {prefs.scrollMode === "paginated" ? <FileText size={16} /> : <ScrollText size={16} />}
            </IconButton>
            <IconButton title={isDark ? "Light mode" : "Night mode"} onClick={() => setPrefs((p) => ({ ...p, theme: isDark ? "light" : "dark" }))}>
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </IconButton>
            <IconButton title="Highlights and notes" active={drawerOpen} onClick={() => setDrawerOpen((d) => !d)}>
              <Highlighter size={16} />
            </IconButton>
          </div>
        </TopBar>

        {/* Audio control bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 20px",
            borderBottom: `1px solid ${theme.border}`,
            background: theme.bgElevated,
            flexWrap: "wrap",
          }}
        >
          <Volume2 size={15} color={theme.textMuted} />
          <select
            value={prefs.voiceName || ""}
            onChange={(e) => setPrefs((p) => ({ ...p, voiceName: e.target.value }))}
            style={{
              fontSize: 12.5,
              padding: "5px 8px",
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: theme.bg,
              color: theme.text,
              maxWidth: 220,
            }}
          >
            {voices.length === 0 && <option>No voices available</option>}
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>

          <select
            value={String(prefs.rate)}
            onChange={(e) => setPrefs((p) => ({ ...p, rate: parseFloat(e.target.value) }))}
            style={{
              fontSize: 12.5,
              padding: "5px 8px",
              borderRadius: 6,
              border: `1px solid ${theme.border}`,
              background: theme.bg,
              color: theme.text,
            }}
          >
            <option value="0.75">0.75x</option>
            <option value="1">1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
          </select>

          <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            {!playing ? (
              <IconButton title="Read this chapter aloud" onClick={speakChapter} disabled={voices.length === 0}>
                <Play size={15} />
              </IconButton>
            ) : (
              <IconButton title={paused ? "Resume" : "Pause"} onClick={togglePause}>
                {paused ? <Play size={15} /> : <Pause size={15} />}
              </IconButton>
            )}
            <IconButton title="Stop" onClick={stopSpeaking} disabled={!playing}>
              <Square size={15} />
            </IconButton>
          </div>
        </div>

        <div style={{ display: "flex" }}>
          {/* Reading pane */}
          <div
            ref={readerRef}
            onMouseUp={handleTextSelection}
            onTouchEnd={handleTextSelection}
            style={{
              flex: 1,
              height: "calc(100vh - 220px)",
              minHeight: 500,
              overflowY: "auto",
              padding: "40px 24px 80px",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div style={{ maxWidth: 620, width: "100%" }}>
              <h2
                style={{
                  fontFamily: serifFont,
                  fontSize: 22,
                  fontWeight: 600,
                  marginBottom: 28,
                  color: theme.text,
                }}
              >
                {chapter?.title}
              </h2>
              {renderedParagraphs.map((p) => (
                <p
                  key={p.key}
                  dangerouslySetInnerHTML={{ __html: p.html }}
                  onClick={(e) => {
                    const mark = e.target.closest("[data-hl-id]");
                    if (mark) {
                      setDrawerOpen(true);
                    }
                  }}
                  style={{
                    fontFamily: serifFont,
                    fontSize: prefs.fontSize,
                    lineHeight: 1.75,
                    marginBottom: 20,
                    color: theme.text,
                  }}
                />
              ))}

              {prefs.scrollMode === "paginated" && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 40,
                    paddingTop: 20,
                    borderTop: `1px solid ${theme.border}`,
                  }}
                >
                  <button
                    onClick={() => chapterIndex > 0 && goToChapter(chapterIndex - 1)}
                    disabled={chapterIndex === 0}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: "transparent",
                      color: theme.text,
                      cursor: chapterIndex === 0 ? "not-allowed" : "pointer",
                      opacity: chapterIndex === 0 ? 0.4 : 1,
                      fontSize: 13,
                    }}
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <button
                    onClick={() => chapterIndex < chapters.length - 1 && goToChapter(chapterIndex + 1)}
                    disabled={chapterIndex === chapters.length - 1}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "8px 14px",
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: "transparent",
                      color: theme.text,
                      cursor: chapterIndex === chapters.length - 1 ? "not-allowed" : "pointer",
                      opacity: chapterIndex === chapters.length - 1 ? 0.4 : 1,
                      fontSize: 13,
                    }}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Highlights drawer */}
          {drawerOpen && (
            <div
              style={{
                width: 300,
                borderLeft: `1px solid ${theme.border}`,
                background: theme.bgElevated,
                height: "calc(100vh - 220px)",
                minHeight: 500,
                overflowY: "auto",
                padding: 18,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <span style={{ fontFamily: serifFont, fontWeight: 600, fontSize: 15 }}>Margin notes</span>
                <button
                  onClick={() => setDrawerOpen(false)}
                  style={{ border: "none", background: "transparent", color: theme.textMuted, cursor: "pointer" }}
                >
                  <X size={16} />
                </button>
              </div>

              {highlights.length === 0 ? (
                <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6 }}>
                  Select any text in the book to highlight it. Your highlights and notes will appear here.
                </div>
              ) : (
                highlights
                  .slice()
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((h) => (
                    <div
                      key={h.id}
                      style={{
                        marginBottom: 14,
                        paddingBottom: 14,
                        borderBottom: `1px solid ${theme.border}`,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: serifFont,
                          fontSize: 13.5,
                          lineHeight: 1.5,
                          borderLeft: `3px solid ${HIGHLIGHT_COLORS.find((c) => c.id === h.color)?.hex}`,
                          paddingLeft: 10,
                          marginBottom: 8,
                          color: theme.text,
                        }}
                      >
                        {h.text}
                      </div>
                      {noteEditing === h.id ? (
                        <textarea
                          autoFocus
                          defaultValue={h.note}
                          onBlur={(e) => {
                            updateHighlightNote(h.id, e.target.value);
                            setNoteEditing(null);
                          }}
                          style={{
                            width: "100%",
                            fontSize: 12.5,
                            padding: 8,
                            borderRadius: 6,
                            border: `1px solid ${theme.border}`,
                            background: theme.bg,
                            color: theme.text,
                            fontFamily: sansFont,
                            minHeight: 50,
                            resize: "vertical",
                          }}
                        />
                      ) : h.note ? (
                        <div
                          onClick={() => setNoteEditing(h.id)}
                          style={{
                            fontSize: 12,
                            color: theme.textMuted,
                            cursor: "pointer",
                            display: "flex",
                            gap: 5,
                            alignItems: "flex-start",
                          }}
                        >
                          <StickyNote size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span>{h.note}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => setNoteEditing(h.id)}
                          style={{
                            fontSize: 11.5,
                            color: theme.accent,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: 0,
                            display: "flex",
                            gap: 4,
                            alignItems: "center",
                          }}
                        >
                          <StickyNote size={11} /> Add note
                        </button>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                        <span style={{ fontSize: 10.5, color: theme.textMuted }}>
                          Ch. {h.chapterIndex + 1}
                        </span>
                        <button
                          onClick={() => removeHighlight(h.id)}
                          style={{ border: "none", background: "transparent", color: theme.textMuted, cursor: "pointer" }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}
        </div>

        {/* Selection popup for adding a highlight */}
        {selection && (
          <div
            style={{
              position: "fixed",
              left: Math.max(20, Math.min(selection.x - 90, window.innerWidth - 200)),
              top: Math.max(20, selection.y - 54),
              background: theme.bgElevated,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: 8,
              display: "flex",
              gap: 6,
              boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              zIndex: 50,
            }}
          >
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.id}
                onClick={() => addHighlight(c.id)}
                title={`Highlight in ${c.label}`}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  border: "none",
                  background: c.hex,
                  cursor: "pointer",
                }}
              />
            ))}
            <button
              onClick={() => setSelection(null)}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                border: `1px solid ${theme.border}`,
                background: "transparent",
                color: theme.textMuted,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Chapter nav for scroll mode */}
        {prefs.scrollMode === "scroll" && (
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "10px 20px",
              borderTop: `1px solid ${theme.border}`,
              background: theme.bgElevated,
              overflowX: "auto",
            }}
          >
            {chapters.map((c, idx) => (
              <button
                key={idx}
                onClick={() => goToChapter(idx)}
                style={{
                  flexShrink: 0,
                  padding: "6px 12px",
                  borderRadius: 7,
                  border: `1px solid ${idx === chapterIndex ? theme.accent : theme.border}`,
                  background: idx === chapterIndex ? theme.accent : "transparent",
                  color: idx === chapterIndex ? theme.accentText : theme.text,
                  fontSize: 11.5,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {c.title}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${theme.border}`, fontFamily: sansFont }}>
      {view === "library" && <LibraryView />}
      {view === "reading" && activeBookContent && <ReadingView />}
    </div>
  );
}
