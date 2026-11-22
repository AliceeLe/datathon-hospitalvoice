"""Generate facilities_eda.ipynb (run once; the notebook itself is the deliverable)."""
import sys
import nbformat as nbf

OUT = sys.argv[1]
cells = []
md = lambda s: cells.append(nbf.v4.new_markdown_cell(s.strip()))
code = lambda s: cells.append(nbf.v4.new_code_cell(s.strip()))

md("""
# EDA: `facilities` (Virtue Foundation dataset, DAIS 2026)

Table: `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities`
Warehouse: `e3b50d583a2daca3` on `dbc-819afcb5-a64b` (CLI profile `dais2026`)

**Read-only.** The table is pulled once with a `SELECT *` and cached to `data/facilities_raw.pkl`.
All cleaning happens on a local copy; the source table is never written.

Goal: for every column, show **what values it can take**: full value counts for categoricals,
item counts for JSON-list columns, ranges plus unparseable values for numeric and date columns,
and patterns and examples for IDs and free text.
""")

code(r'''
import json, re, subprocess, time, urllib.request
from pathlib import Path
from urllib.parse import urlparse

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from IPython.display import display, Markdown

pd.set_option("display.max_rows", 400)
pd.set_option("display.max_colwidth", 80)
pd.set_option("display.width", 200)

# Chart style: one hue for single-series charts; orange only to flag misaligned rows.
BLUE, ORANGE = "#2a78d6", "#eb6834"
INK, INK2, GRID = "#0b0b0b", "#52514e", "#e6e5e1"
plt.rcParams.update({
    "figure.facecolor": "#fcfcfb", "axes.facecolor": "#fcfcfb",
    "axes.edgecolor": INK2, "axes.labelcolor": INK2, "text.color": INK,
    "xtick.color": INK2, "ytick.color": INK2,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8, "axes.axisbelow": True,
    "font.size": 10, "axes.titlesize": 12, "axes.titleweight": "bold", "axes.titlelocation": "left",
})
''')

md("## 1. Load (read-only query, cached locally)")
code(r'''
PROFILE, WAREHOUSE = "dais2026", "e3b50d583a2daca3"
TABLE = "databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities"
CACHE = Path("data/facilities_raw.pkl")
REFRESH = False   # set True to re-pull from the warehouse

def _api(method, path, body=None):
    cmd = ["databricks", "-p", PROFILE, "api", method, path]
    if body is not None:
        cmd += ["--json", json.dumps(body)]
    return json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)

def run_sql(sql):
    """Run a query on the SQL warehouse via the Statement API; returns a DataFrame of strings.
    Uses EXTERNAL_LINKS because the full table exceeds the 25 MB inline limit."""
    r = _api("post", "/api/2.0/sql/statements", {
        "warehouse_id": WAREHOUSE, "statement": sql, "wait_timeout": "50s",
        "format": "JSON_ARRAY", "disposition": "EXTERNAL_LINKS"})
    while r["status"]["state"] in ("PENDING", "RUNNING"):
        time.sleep(3)
        r = _api("get", f"/api/2.0/sql/statements/{r['statement_id']}")
    if r["status"]["state"] != "SUCCEEDED":
        raise RuntimeError(r["status"])
    cols = [c["name"] for c in r["manifest"]["schema"]["columns"]]
    rows, links = [], r.get("result", {}).get("external_links", [])
    while links:
        nxt = None
        for link in links:
            # presigned cloud-storage URL: must NOT send the Databricks auth header
            with urllib.request.urlopen(link["external_link"]) as f:
                rows.extend(json.load(f))
            nxt = link.get("next_chunk_index")
        links = (_api("get", f"/api/2.0/sql/statements/{r['statement_id']}/result/chunks/{nxt}")
                 .get("external_links", []) if nxt is not None else [])
    df = pd.DataFrame(rows, columns=cols)
    assert len(df) == r["manifest"]["total_row_count"], "incomplete download"
    return df

if REFRESH or not CACHE.exists():
    CACHE.parent.mkdir(exist_ok=True)
    raw = run_sql(f"SELECT * FROM {TABLE}")
    raw.to_pickle(CACHE)
else:
    raw = pd.read_pickle(CACHE)
print(f"{raw.shape[0]:,} rows x {raw.shape[1]} columns")
''')

md("""
## 2. Normalise missing values and flag misaligned rows

Almost every column is a `string`. Missing values usually appear as the literal text `'null'`,
or as `''`, `'[]'` or `'{}'`, not as SQL NULL. They are all mapped to `NaN` here.

**Broken rows.** Some text fields (e.g. `description`) contained line breaks, and the load split
them into extra rows. The result:
- **88 fragment rows**: the tail of a broken record, spread across the wrong columns. Their `unique_id`
  is not a UUID. They are **dropped** here (section 9 shows them).
- **30 truncated facilities**: real records (valid UUID) whose text was cut at the line break, so the
  columns after the break are empty. They are **kept** and flagged with `is_truncated`.
""")
code(r'''
MISSING_TOKENS = {"", "null", "none", "nan", "[]", "{}", '[""]'}

df = raw.copy()
for c in df.columns:
    s = df[c].astype("string")
    df[c] = s.mask(s.str.strip().str.lower().isin(MISSING_TOKENS))

is_fragment = ~df["unique_id"].str.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").fillna(False)
bad = df[is_fragment]
df = df[~is_fragment].reset_index(drop=True)
is_truncated = df["source"].ne("kie").fillna(True)   # complete records always end with source='kie'
N = len(df)

print(f"facilities kept: {N:,} (of which truncated: {is_truncated.sum()}) | fragment rows dropped: {len(bad)}")
print(f"duplicate unique_id among clean rows: {df.unique_id.duplicated().sum()}")
''')

md("## 3. Helpers")
code(r'''
def parse_list(v):
    """JSON-array string -> list of unique, non-empty, stripped items (order kept)."""
    if pd.isna(v):
        return None
    try:
        items = json.loads(v)
    except (ValueError, TypeError):
        return None
    if not isinstance(items, list):
        return None
    out = list(dict.fromkeys(str(x).strip() for x in items
                             if x is not None and str(x).strip().lower() not in MISSING_TOKENS))
    return out or None

def to_num(s):
    return pd.to_numeric(s, errors="coerce")

def value_table(s, n=None, denom=None, label="pct_of_non_missing"):
    """Value counts with a % column; n=None shows every value.
    denom defaults to the number of non-missing values; for exploded lists pass the row count."""
    vc = s.value_counts(dropna=True)
    t = pd.DataFrame({"count": vc, label: (100 * vc / (denom or vc.sum())).round(2)})
    return t if n is None else t.head(n)

def list_table(col, n=None):
    """Item counts for a list column, as % of rows that have a list."""
    L = lists[col].dropna()
    return value_table(L.explode(), n, denom=len(L), label="pct_of_rows_with_list")

def header(col, s):
    nm = s.isna().sum()
    display(Markdown(f"### `{col}`\nmissing **{nm:,}** ({100*nm/N:.1f}%) · distinct **{s.nunique():,}**"
                     + (" · *all values missing*" if nm == N else "")))

def barh(series, title, xlabel="rows", color=BLUE, figsize=(7, None)):
    series = series.iloc[::-1]
    h = figsize[1] or max(2.2, 0.28 * len(series) + 0.8)
    fig, ax = plt.subplots(figsize=(figsize[0], h))
    ax.barh([str(x) for x in series.index], series.values, color=color, height=0.7)
    ax.set_title(title); ax.set_xlabel(xlabel); ax.grid(axis="y", visible=False)
    for y, v in enumerate(series.values):
        ax.text(v, y, f" {v:,}", va="center", fontsize=8, color=INK2)
    plt.tight_layout(); plt.show()
''')

md("""
## 4. Column overview

Each column is assigned a **kind**, which decides how its possible values are shown below.
""")
code(r'''
KIND = {
    # identifiers
    "unique_id": "id", "source_content_id": "id", "content_table_id": "id", "cluster_id": "id",
    "source_ids": "id_list",
    # low-cardinality categoricals
    "organization_type": "categorical", "facilityTypeId": "categorical", "operatorTypeId": "categorical",
    "address_country": "categorical", "address_countryCode": "categorical", "countries": "categorical",
    "acceptsVolunteers": "categorical", "affiliated_staff_presence": "categorical",
    "custom_logo_presence": "categorical", "source": "categorical",
    # lists of categorical codes
    "source_types": "cat_list", "affiliationTypeIds": "cat_list", "specialties": "cat_list",
    # lists of free-text items
    "procedure": "text_list", "equipment": "text_list", "capability": "text_list",
    "phone_numbers": "contact_list", "websites": "contact_list", "source_urls": "contact_list",
    # numbers stored as strings
    "yearEstablished": "numeric", "area": "numeric", "numberDoctors": "numeric", "capacity": "numeric",
    "distinct_social_media_presence_count": "numeric", "number_of_facts_about_the_organization": "numeric",
    "post_metrics_post_count": "numeric", "engagement_metrics_n_followers": "numeric",
    "engagement_metrics_n_likes": "numeric", "engagement_metrics_n_engagements": "numeric",
    "latitude": "numeric", "longitude": "numeric",
    # dates
    "recency_of_page_update": "date", "post_metrics_most_recent_social_media_post_date": "date",
    # location text
    "address_line1": "location", "address_line2": "location", "address_line3": "location",
    "address_city": "location", "address_stateOrRegion": "location", "address_zipOrPostcode": "location",
    "coordinates": "geojson",
    # contact & free text
    "name": "text", "description": "text", "email": "contact", "officialPhone": "contact",
    "officialWebsite": "contact", "facebookLink": "contact",
}
assert set(KIND) == set(df.columns), set(df.columns) ^ set(KIND)

overview = pd.DataFrame({
    "kind": pd.Series(KIND),
    "missing_pct": (100 * df.isna().mean()).round(1),
    "distinct": df.nunique(),
    "top_value": df.apply(lambda s: s.mode().iloc[0][:50] if s.notna().any() else None),
    "max_len": df.apply(lambda s: s.str.len().max()),
}).loc[df.columns]
overview
''')

code(r'''
miss = overview.missing_pct.sort_values(ascending=False)
fig, ax = plt.subplots(figsize=(8, 11))
ax.barh(miss.index[::-1], miss.values[::-1], color=BLUE, height=0.7)
ax.set_xlim(0, 100); ax.set_xlabel("% of rows missing (NULL or 'null' / '' / '[]')")
ax.set_title(f"Missing values by column (n = {N:,} facilities)"); ax.grid(axis="y", visible=False)
for y, v in enumerate(miss.values[::-1]):
    ax.text(v + 0.8, y, f"{v:.1f}%", va="center", fontsize=8, color=INK2)
plt.tight_layout(); plt.show()
''')

md("""
## 5. Categorical columns: every possible value
""")
code(r'''
for col in [c for c, k in KIND.items() if k == "categorical"]:
    header(col, df[col])
    if df[col].notna().any():
        display(value_table(df[col]))
''')
code(r'''
barh(df.facilityTypeId.value_counts(), "facilityTypeId: all values")
barh(df.operatorTypeId.fillna("(missing)").value_counts(), "operatorTypeId: all values")
''')
code(r'''
display(Markdown("**facilityTypeId × operatorTypeId**"))
pd.crosstab(df.facilityTypeId.fillna("(missing)"), df.operatorTypeId.fillna("(missing)"),
            margins=True).sort_values("All", ascending=False)
''')

md("""
## 6. List columns (JSON arrays)

Lists are parsed, duplicates within a row are removed (rows often repeat the same item),
and the items are then counted across rows. The counts are **rows containing the item**.
""")
code(r'''
lists = {c: df[c].map(parse_list) for c, k in KIND.items() if k.endswith("_list")}

def list_summary(col):
    L = lists[col]
    n_items = L.dropna().map(len)
    items = L.dropna().explode()
    return {"rows_with_list": L.notna().sum(), "distinct_items": items.nunique(),
            "items_per_row_median": n_items.median(), "items_per_row_max": n_items.max()}

pd.DataFrame({c: list_summary(c) for c in lists}).T
''')

md("### 6a. Lists of codes: every possible value")
code(r'''
for col in ["source_types", "affiliationTypeIds"]:
    header(col, df[col])
    display(list_table(col))
''')
md("""
### `specialties`
There are about 2,900 distinct codes, but they form a long tail: roughly 300 appear in 10 or more rows, and about 2,000 appear only once
(variants such as `holisticDentistry`). The table below lists every code found in at least 10 rows. The complete list is in the CSV export (section 10).
""")
code(r'''
header("specialties", df.specialties)
spec_t = list_table("specialties")
print(f"codes in >=10 rows: {(spec_t['count'] >= 10).sum()} | in exactly 1 row: {(spec_t['count'] == 1).sum()}")
with pd.option_context("display.max_rows", 500):
    display(spec_t[spec_t["count"] >= 10])
''')
code(r'''
spec = lists["specialties"].dropna().explode().value_counts()
barh(spec.head(30), f"specialties: top 30 of {len(spec)} values (rows containing each)")
''')

md("""
### 6b. Lists of free text: `procedure`, `equipment`, `capability`

These hold free-text sentences, so the number of distinct values is in the thousands. The output shows
the most common items and the number of items per row.
""")
code(r'''
for col in ["procedure", "equipment", "capability"]:
    header(col, df[col])
    items = lists[col].dropna().explode()
    print(f"distinct items: {items.nunique():,} | items appearing in only 1 row: "
          f"{(items.value_counts() == 1).sum():,}")
    display(list_table(col, 25))

fig, axes = plt.subplots(1, 3, figsize=(12, 3), sharey=False)
for ax, col in zip(axes, ["procedure", "equipment", "capability"]):
    k = lists[col].dropna().map(len).clip(upper=30)
    ax.hist(k, bins=range(1, 32), color=BLUE, rwidth=0.85)
    ax.set_title(col); ax.set_xlabel("items per row (30 = 30+)")
axes[0].set_ylabel("rows")
plt.tight_layout(); plt.show()
''')

md("### 6c. Contact and URL lists: `phone_numbers`, `websites`, `source_urls` (shown as domains)")
code(r'''
def domain(u):
    u = u.strip().lower()
    host = urlparse(u if "://" in u else "http://" + u).netloc
    return host.removeprefix("www.") or None

for col in ["websites", "source_urls"]:
    header(col, df[col])
    L = lists[col].dropna().map(lambda l: list({domain(u) for u in l} - {None}))
    print(f"distinct domains: {L.explode().nunique():,}")
    display(value_table(L.explode(), 20, denom=len(L), label="pct_of_rows_with_list"))

header("phone_numbers", df.phone_numbers)
ph = lists["phone_numbers"].dropna().explode()
print("prefix pattern of individual numbers:")
display(value_table(ph.str.replace(r"\d", "9", regex=True).str[:6] + " (len " + ph.str.len().astype(str) + ")", 10))
''')

md("""
## 7. Numeric columns (stored as strings)

`unparseable` counts non-missing values that are not numbers. The table also lists the distinct
values when there are few of them.
""")
code(r'''
num_cols = [c for c, k in KIND.items() if k == "numeric"]
num = df[num_cols].apply(to_num)

rows = {}
for c in num_cols:
    s = num[c].dropna()
    rows[c] = {"non_missing": df[c].notna().sum(),
               "unparseable": int(df[c].notna().sum() - len(s)),
               "min": s.min(), "p25": s.quantile(.25), "median": s.median(),
               "p75": s.quantile(.75), "p99": s.quantile(.99), "max": s.max(),
               "distinct": s.nunique()}
pd.DataFrame(rows).T.round(2)
''')
code(r'''
for c in num_cols:
    bad_vals = df[c][df[c].notna() & num[c].isna()]
    if len(bad_vals):
        print(f"{c}: unparseable values ->", bad_vals.str[:60].value_counts().head(5).to_dict())

for c in ["distinct_social_media_presence_count", "number_of_facts_about_the_organization"]:
    header(c, df[c])
    display(value_table(num[c].astype("Int64")).sort_index().T)
''')
code(r'''
plot_cols = ["yearEstablished", "numberDoctors", "capacity", "area", "post_metrics_post_count",
             "engagement_metrics_n_followers", "engagement_metrics_n_likes", "engagement_metrics_n_engagements"]
fig, axes = plt.subplots(2, 4, figsize=(14, 6))
for ax, c in zip(axes.flat, plot_cols):
    s = num[c].dropna()
    if c == "yearEstablished":
        s = s[(s >= 1800) & (s <= 2026)]
        ax.hist(s, bins=40, color=BLUE, rwidth=0.9); ax.set_xlabel("year (1800–2026 only)")
    else:
        ax.hist(np.log10(s + 1), bins=30, color=BLUE, rwidth=0.9); ax.set_xlabel("log10(value + 1)")
    ax.set_title(c.replace("engagement_metrics_", "eng_").replace("post_metrics_", ""), fontsize=10)
fig.suptitle(f"Numeric distributions (n = non-missing rows)", x=0.01, ha="left", fontweight="bold")
plt.tight_layout(); plt.show()

ye = num.yearEstablished.dropna()
print(f"yearEstablished outside 1800–2026: {((ye < 1800) | (ye > 2026)).sum()} ->",
      sorted(ye[(ye < 1800) | (ye > 2026)].unique())[:15])
''')

md("## 8. Dates, location, contact and ID columns")
code(r'''
for c in [c for c, k in KIND.items() if k == "date"]:
    header(c, df[c])
    d = pd.to_datetime(df[c], errors="coerce", format="%Y-%m-%d")
    print(f"range: {d.min().date()} → {d.max().date()} | unparseable: {df[c].notna().sum() - d.notna().sum()}")
    display(d.dt.year.value_counts().sort_index().rename("rows").to_frame().T)
''')

md("### Location: every state/region value, top cities and postcodes")
code(r'''
header("address_stateOrRegion", df.address_stateOrRegion)
display(value_table(df.address_stateOrRegion))
''')
code(r'''
barh(df.address_stateOrRegion.value_counts().head(36), "address_stateOrRegion: top 36")
for c in ["address_city", "address_zipOrPostcode", "address_line1", "address_line2", "address_line3"]:
    header(c, df[c])
    display(value_table(df[c], 15))
zip_ok = df.address_zipOrPostcode.str.fullmatch(r"[1-9]\d{5}")
print(f"postcodes that are valid 6-digit Indian PINs: {zip_ok.sum():,} / {df.address_zipOrPostcode.notna().sum():,}")
''')
code(r'''
lat, lon = num.latitude, num.longitude
in_india = lat.between(6, 37) & lon.between(68, 98)
fig, ax = plt.subplots(figsize=(6.5, 7))
n_out = int((~in_india & lat.notna()).sum())
ax.scatter(lon[in_india], lat[in_india], s=8, color=BLUE, alpha=0.35, linewidths=0)
ax.set_xlim(66, 100); ax.set_ylim(5, 38); ax.set_aspect("equal")
ax.set_xlabel("longitude"); ax.set_ylabel("latitude")
ax.set_title(f"Facility coordinates ({in_india.sum():,} shown; {n_out} fall outside India, listed below)")
plt.tight_layout(); plt.show()

print("coordinates GeoJSON types:", df.coordinates.dropna().map(lambda v: json.loads(v)["type"]).value_counts().to_dict())
display(df.loc[~in_india & lat.notna(), ["name", "address_city", "address_stateOrRegion", "latitude", "longitude"]])
''')

md("### Contact fields")
code(r'''
for c in ["email", "officialPhone", "officialWebsite", "facebookLink"]:
    header(c, df[c])
    display(value_table(df[c], 8))

e = df.email.dropna()
print("email patterns:")
print(pd.Series({
    "valid single address": e.str.fullmatch(r"[^@\s\[\]\"]+@[^@\s]+\.[a-z]{2,}", case=False).sum(),
    "JSON list of addresses": e.str.startswith("[").sum(),
    "Cloudflare-obfuscated '[email protected]'": e.str.contains("protected", regex=False).sum(),
}).to_string())
p = df.officialPhone.dropna()
print("\nofficialPhone '+91' + 10 digits:", p.str.fullmatch(r"\+91\d{10}").sum(), "/", len(p))
print("officialWebsite == 'true' (boolean leaked into URL field):", (df.officialWebsite == "true").sum())
print("facebookLink not starting with http:", (~df.facebookLink.dropna().str.startswith("http")).sum(),
      "->", df.facebookLink.dropna()[~df.facebookLink.dropna().str.startswith("http")].value_counts().head(5).to_dict())
''')

md("### Free text and IDs")
code(r'''
for c in ["name", "description"]:
    header(c, df[c])
    L = df[c].str.len()
    print(f"length: median {L.median():.0f}, p95 {L.quantile(.95):.0f}, max {L.max():.0f}")
    display(value_table(df[c], 12))

display(Markdown("**Identifier columns**: are they unique?"))
id_cols = [c for c, k in KIND.items() if k == "id"]
pd.DataFrame({c: {"non_missing": df[c].notna().sum(), "distinct": df[c].nunique(),
                  "duplicated_rows": df[c].dropna().duplicated(keep=False).sum(),
                  "looks_like": "uuid" if df[c].dropna().str.fullmatch(r"[0-9a-f-]{36}").mean() > .9 else "hex/other"}
              for c in id_cols}).T
''')
code(r'''
dups = df[df.unique_id.duplicated(keep=False)].sort_values("unique_id")
print(f"{dups.unique_id.nunique()} unique_ids appear more than once; "
      f"rows identical apart from the id? {dups.drop(columns='unique_id').duplicated(keep=False).all()}")
dups[["unique_id", "name", "address_city", "facilityTypeId", "source_content_id"]]
''')

md("""
## 9. Broken rows

**Fragments (dropped).** Pieces of text from the record above them, sitting in the wrong columns.
**Truncated facilities (kept).** Columns after the cut are empty; the cell lists which column the text broke in.
""")
code(r'''
print(f"{len(bad)} fragment rows. Examples (first 60 chars of the first 3 columns):")
display(bad.iloc[:8, :3].apply(lambda s: s.str[:60]))

trunc = df[is_truncated]
last_filled = trunc.apply(lambda r: r.last_valid_index(), axis=1)
print(f"\n{len(trunc)} truncated facilities; column where the record was cut:")
display(last_filled.value_counts().rename("rows").to_frame())
''')

md("## 10. Export: every column's possible values in one file")
code(r'''
out = []
for col, kind in KIND.items():
    if kind in ("id", "id_list", "geojson") or col in ("latitude", "longitude"):
        continue                       # identifiers / raw coordinates carry no reusable values
    s = lists[col].dropna().explode() if col in lists else df[col]
    if kind == "contact_list" and col != "phone_numbers":
        s = s.map(domain)
    if kind == "numeric":
        s = to_num(s)
    cap = 1000 if kind in ("text", "text_list", "location", "contact", "contact_list") else None
    t = value_table(s, cap).reset_index(names="value").assign(column=col, kind=kind)
    out.append(t)
values = pd.concat(out)[["column", "kind", "value", "count", "pct_of_non_missing"]]
values.to_csv("data/facilities_column_values.csv", index=False)
print(f"wrote data/facilities_column_values.csv: {len(values):,} rows "
      "(all values for categorical/numeric/date/code-list columns; top 1,000 for free text)")
''')

md("""
## 11. Key findings

**Structure**
- 10,088 raw rows → **10,000 facilities**, all in India (`address_country` = India, `organization_type` = facility, `source` = kie).
  88 rows are fragments of descriptions that contained line breaks; 30 more facilities are cut off after `description`.
- 11 `unique_id`s appear twice, and each pair is an **exact duplicate row**. Deduplicate before counting.
- `source_content_id` / `content_table_id` are not unique (about 9,040 distinct). Several facilities share a source page.
- Almost everything is a `string`. Missing values are mostly the text `'null'`, not SQL NULL. Lists are JSON-array strings
  that often repeat the same item (`["familyMedicine","familyMedicine"]`).

**Categorical columns (the full sets of values)**
- `facilityTypeId`: hospital 57%, clinic 38%, dentist 5%, plus doctor / farmacy / pharmacy / nursing_home (`farmacy` is a typo for `pharmacy`).
- `operatorTypeId`: private 95%, public 5%, government (2). About 7% missing.
- `affiliationTypeIds` (12% filled): government, academic, philanthropy-legacy, faith-tradition, community, private, public, plus 12 one-off codes.
- `source_types`: overture, dynamic, constant, mongo_facility, mongo_ngo.
- `affiliated_staff_presence` / `custom_logo_presence`: true / false. `acceptsVolunteers`: almost entirely empty. `countries`: completely empty.

**List / free-text columns**
- `specialties`: 2,927 camelCase codes in a long tail. About 300 occur in 10 or more rows; internalMedicine (68% of facilities), familyMedicine, gynecologyAndObstetrics, dentistry …
- `procedure` (89k distinct), `equipment` (35k) and `capability` (168k) are free-text sentences with many near-duplicates
  ("Dental implants" / "Dental Implants" / "Provides dental implants"). They need normalisation or NLP before they can be used as categories.

**Numeric (stored as strings, all parse)**
- `numberDoctors` (64% missing): median 2, max 15,000. `capacity` (75% missing): median 100 beds, max 200,000. Both have implausible outliers.
- `yearEstablished` (52% missing): mostly 1990–2020. 7 invalid values (0, 7, 15, 1723, 1756).
- `area` is 99% missing.

**Location / contact**
- `address_stateOrRegion` needs cleaning: variants such as `Tamilnadu` vs `Tamil Nadu`, and city names (Thane, Mumbai) sitting in the state field.
- 97.7% of postcodes are valid 6-digit PINs. Coordinates are GeoJSON Points; 6 fall outside India.
- `email`: 360 are the Cloudflare-obfuscated placeholder `[email protected]`, and 389 are JSON lists. `officialPhone` is 99% `+91` + 10 digits.
- `recency_of_page_update` runs up to 2027-07-20, which is in the future.
""")

nb = nbf.v4.new_notebook(cells=cells, metadata={
    "kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"}})
nbf.write(nb, OUT)
print("wrote", OUT)
