# Contributing

Thanks for your interest in **Flood & Sea Level Rise Visualization**. This document explains
how to file issues, submit pull requests, and propose new content. Contributions of all sizes
are welcome — from a one-line typo fix to a new methodology component.

If anything here is unclear, open an issue and ask.

---

## Code of conduct

Be respectful, assume good faith, and keep discussion focused on the work. Personal attacks,
harassment, or discriminatory language are not welcome. Maintainers may close threads or
revert contributions that violate this norm.

---

## Ways to contribute

| Kind of contribution | How |
|----------------------|-----|
| **Bug report** | Open a [GitHub issue](https://github.com/ajprice16/flood-slr-visualization/issues) with reproduction steps. |
| **Feature request** | Open an issue first to discuss scope before writing code. |
| **Code fix or feature** | Fork → branch → PR. See [Code contributions](#code-contributions) below. |
| **Documentation fix** | Wiki pages live in the separate `flood-slr-visualization.wiki.git` repo — see [Documentation contributions](#documentation-contributions). For README or in-repo doc fixes, just open a PR here. |
| **New story-mode city** | See [Adding a new story-mode city](#adding-a-new-story-mode-city). |
| **Scientific feedback** | Open an issue tagged `methodology` or `science`. You do not need to write code to flag a concern, suggest a dataset, or share a citation. |

---

## Before you start

For non-trivial work (anything beyond a typo or one-file fix):

1. **Search existing issues** to avoid duplicating effort.
2. **Open an issue** describing what you want to do and why. This avoids the unhappy case
   where a substantial PR gets rejected because the design conflicts with planned work.
3. Wait for a brief acknowledgement before investing significant time.

For typos, broken links, dead images, or other obvious fixes, skip the issue and open a PR
directly.

---

## Development environment

The fastest path is Docker:

```bash
docker compose up -d
```

For native dev with hot reload, see the [Development](https://github.com/ajprice16/flood-slr-visualization/wiki/Development)
wiki page. In short:

- **Backend:** `cd Backend && .venv/bin/python -m uvicorn main:app --reload --port 8000`
- **Frontend:** `cd Frontend && npm install && npm run dev` (Vite on port 5173)

Verify the backend is up with `curl http://localhost:8000/api/health`.

---

## Code contributions

### Workflow

1. **Fork** the repository and create a topic branch off `main`:
   ```bash
   git checkout -b fix/short-description
   ```
2. **Make your change.** Keep the diff focused on one concern. If you find unrelated cleanup
   along the way, prefer a separate PR for it.
3. **Run the tests** before pushing:
   - Backend: `cd Backend && pytest`
   - Frontend: `cd Frontend && npm test`
4. **Push** to your fork and open a pull request against `main`.
5. **Describe the change** in the PR body: what, why, and any behaviour the reviewer should
   manually verify (e.g. "test by toggling connectivity at zoom 11 over Miami").

### Style and conventions

- **Python** (Backend): match the existing style. PEP 8, type hints where the surrounding
  code uses them, prefer standard library + already-included dependencies over adding new
  ones. Avoid broad `try/except` blocks; let exceptions surface unless you have a specific
  recovery in mind.
- **JavaScript/React** (Frontend): functional components with hooks, prop names that match
  the existing convention, no new state-management libraries without discussion.
- **Comments**: explain *why*, not *what*. Don't restate the code in prose.
- **Commits**: small, focused, present-tense subject line ("Add city marker hover state"
  not "Added…"). Squash trivia commits before requesting review.

### What gets rejected

- Adding a new top-level dependency without discussion (especially in the Backend).
- Sweeping refactors bundled with an unrelated bug fix.
- Reformatting unrelated files (run formatters on your changes only).
- Breaking the on-demand tile rendering contract: every flood pixel must still be computable
  from the underlying DEM at request time.
- Hard-coding secrets, API keys, or credentials anywhere in tracked files.

### Tests

- New backend behaviour should ship with a `pytest` test if it touches request handling,
  projection resolution, VLM lookup, or tile rendering.
- New frontend behaviour: at minimum a smoke test in `Frontend/src/__tests__/`. Visual UI
  changes do not strictly require tests but please describe how you manually verified.
- Don't lower or skip existing tests to make yours pass. If a test seems wrong, raise it in
  the PR description.

### Performance considerations

The backend serves tiles at interactive latency (warm cache ~5 ms, cold render ~80–200 ms).
Changes that materially regress this — extra DEM reads per tile, blocking I/O on the request
path, dropping the LRU cache — need a strong justification and ideally a measurement.

---

## Documentation contributions

There are **two** documentation surfaces:

| Surface | Lives in | How to edit |
|---------|----------|-------------|
| `README.md`, `CONTRIBUTING.md`, `CLAUDE.md`, code comments | This repo | Standard PR against `main`. |
| Wiki pages (User Guide, Architecture, Data Sources, etc.) | Separate repo: `flood-slr-visualization.wiki.git` | Clone the wiki repo, edit, commit, push directly. |

To edit the wiki:

```bash
git clone https://github.com/ajprice16/flood-slr-visualization.wiki.git
cd flood-slr-visualization.wiki
# edit pages
git add -A && git commit -m "Fix typo on Data Sources page" && git push
```

GitHub wikis don't have PRs. If you don't have push access to the wiki, **open an issue in
this main repo** with the proposed change and a maintainer will apply it.

Wiki images live in `images/` inside the wiki repo. Use relative paths in markdown:
`![Caption](images/your-image.png)`.

---

## Adding a new story-mode city

Story-mode cities are short narrative panels that appear when a visitor clicks **Start Story**.
Each city is defined in three places:

1. **`Frontend/src/App.jsx`** — append an entry to the `stories` array:
   ```jsx
   {
       name: "City Name",
       coords: [longitude, latitude],  // note: lon first
       zoom: 11,
       scenario: "ssp245",             // or ssp126 / ssp370 / ssp585
       year: 2100,
       percentile: 50,
       textFile: "/cities/city-name.txt",
       media: null
   }
   ```
2. **`Frontend/public/cities/city-name.txt`** — 2–4 sentences of narrative. Plain text. The
   first sentence is the strongest — it shows up in the marker popup on the map.
3. **`Frontend/src/MapView.jsx`** — add a matching entry in the `addCityMarkers` function so
   the red pin appears on the map.

PR guidelines for new cities:

- **Be specific about flood vulnerability.** Generic "this city is at risk" copy will be
  asked to be rewritten. Cite a published report, local plan, or measurement.
- **Pick a scenario/year that demonstrates the science**, not the most dramatic. Defaulting
  to SSP5-8.5 at 2150 for every new city is a bad pattern.
- **Verify the DEM coverage** before submitting: the area you choose must be covered by a
  DiluviumDEM tile, otherwise the flood overlay will be blank.
- **Keep the narrative neutral.** This is a scientific tool, not advocacy.

---

## Scientific contributions and methodology feedback

If you have a concern about the methodology, a relevant dataset to suggest, or a published
paper that should be cited, please open an issue with the label `methodology`. You do not
need to write code or a PR.

Useful things to include:

- The specific page, function, or claim you are responding to.
- A citation (DOI, link, or full reference).
- A short statement of how the methodology should change, if applicable.

Methodology changes that affect the visible projection — changing the SLR resolution, swapping
the DEM, altering the VLM combination logic — go through extra review and may require
maintainer agreement before being implemented.

---

## License

This project is licensed under the [MIT License](LICENSE). By submitting a contribution you
agree that your contribution will be released under the same license.

The MIT license covers the source code only. The datasets and basemap services the app uses
at runtime retain their own licenses — see the [Data Sources](https://github.com/ajprice16/flood-slr-visualization/wiki/Data-Sources)
wiki page for the full attribution table.

---

## Questions

If you're not sure whether something is in scope, open a draft issue and ask. It's much
easier to align on direction in 5 minutes than to rework a PR.
