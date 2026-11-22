"""Signs a facility record shouldn't be trusted — run on the cached raw table (data/facilities_raw.pkl).

Checks (one flag per sign, per record):
  1. merged records        text/fields that look like two or more facilities in one record
  2. location contradiction coordinates far from the stated city or PIN area, or outside India
  3. thin evidence         services listed with almost no supporting text
  4. shared source page    the record's source URL also feeds many other facilities
  5. duplicates/fragments  broken rows, exact duplicates, near-duplicate facilities

Writes trust_flags.csv (one row per record) and prints a summary with examples.
"""
import json, re, sys
from collections import Counter
import numpy as np
import pandas as pd

SRC = sys.argv[1] if len(sys.argv) > 1 else "../data/facilities_raw.pkl"
df = pd.read_pickle(SRC).reset_index(drop=True)
MISSING = {"", "null", "none", "nan", "[]", "n/a", "na"}


def is_missing(v):
    return v is None or (isinstance(v, float) and np.isnan(v)) or str(v).strip().lower() in MISSING


def as_list(v):
    if is_missing(v):
        return []
    s = str(v).strip()
    if s.startswith("["):
        try:
            out = json.loads(s)
            return [str(x).strip() for x in out if not is_missing(x)]
        except ValueError:
            pass
    return [s]


def text(v):
    return "" if is_missing(v) else str(v)


def km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * np.arcsin(np.sqrt(a))


UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
df["id_ok"] = df["unique_id"].astype(str).str.match(UUID)
df["name_n"] = df["name"].map(lambda s: re.sub(r"[^a-z0-9]", "", text(s).lower()))
df["city_n"] = df["address_city"].map(lambda s: text(s).strip().lower())
df["pin"] = df["address_zipOrPostcode"].map(lambda s: re.sub(r"\D", "", text(s))[:6])
df["lat"] = pd.to_numeric(df["latitude"], errors="coerce")
df["lon"] = pd.to_numeric(df["longitude"], errors="coerce")
df["desc"] = df["description"].map(text)
LISTS = ["specialties", "procedure", "equipment", "capability"]
for c in LISTS:
    df[c + "_l"] = df[c].map(as_list)

# ── 5. duplicates & fragments ────────────────────────────────────────────────
df["f_fragment"] = ~df["id_ok"]
df["f_truncated"] = df["source"].map(is_missing) & df["id_ok"]
orig = pd.read_pickle(SRC).reset_index(drop=True)
df["f_exact_dup"] = orig.map(lambda v: "" if v is None else str(v)).duplicated(keep="first")
df["f_repeated_id"] = df["id_ok"] & df["unique_id"].duplicated(keep=False) & ~df["f_exact_dup"]
real = df["id_ok"] & ~df["f_exact_dup"] & (df["name_n"] != "")
grp = df[real].groupby(["name_n", "city_n"])["unique_id"].transform("nunique")
df["f_near_dup"] = False
df.loc[grp.index, "f_near_dup"] = grp > 1

# ── 2. location contradictions ───────────────────────────────────────────────
has_xy = df["lat"].notna() & df["lon"].notna()
df["f_no_coords"] = df["id_ok"] & (~has_xy | ((df["lat"] == 0) & (df["lon"] == 0)))
in_india = df["lat"].between(6, 37.5) & df["lon"].between(68, 97.5)
df["f_outside_india"] = has_xy & ~in_india & ~df["f_no_coords"]
ok = has_xy & in_india
for key, col, thresh in (("city_n", "km_from_city", 50), ("pin3", "km_from_pin_area", 100)):
    if key == "pin3":
        df["pin3"] = df["pin"].str[:3].where(df["pin"].str.len() == 6, "")
    g = df[ok & (df[key] != "")].groupby(key)
    med = g[["lat", "lon"]].median()
    n = g.size()
    m = df[[key]].join(med, on=key, rsuffix="_m").join(n.rename("peers"), on=key)
    d = km(df["lat"], df["lon"], m["lat_m"] if "lat_m" in m else m["lat"], m["lon_m"] if "lon_m" in m else m["lon"])
    df[col] = np.where(ok & (m["peers"] >= 3), d, np.nan)
    df["f_" + col] = df[col] > thresh
df["f_location"] = df["f_outside_india"] | df["f_km_from_city"] | df["f_km_from_pin_area"]

# ── 3. services listed with almost no supporting text ────────────────────────
df["n_specialties"] = df["specialties_l"].map(len)
df["support_chars"] = (df["desc"].str.len() + df["procedure_l"].map(lambda l: sum(map(len, l)))
                       + df["equipment_l"].map(lambda l: sum(map(len, l))) + df["capability_l"].map(lambda l: sum(map(len, l))))
claims = df["n_specialties"] > 0
df["f_tags_only"] = claims & df["procedure_l"].map(len).eq(0) & df["equipment_l"].map(len).eq(0)
df["f_thin_text"] = claims & (df["support_chars"] < 200)
df["f_many_claims_little_text"] = (df["n_specialties"] >= 10) & (df["support_chars"] < 100 * np.sqrt(df["n_specialties"]))
df["f_thin_evidence"] = df["id_ok"] & (df["f_tags_only"] | df["f_thin_text"] | df["f_many_claims_little_text"])

# ── 4. many facilities sharing one source page ──────────────────────────────
df["urls"] = df["source_urls"].map(as_list)
url_count = Counter(u for us in df.loc[df["id_ok"], "urls"] for u in set(us))
df["max_url_share"] = df["urls"].map(lambda us: max((url_count[u] for u in us), default=0))
df["f_shared_page"] = df["id_ok"] & (df["max_url_share"] >= 5)
df["f_shared_page_20"] = df["id_ok"] & (df["max_url_share"] >= 20)   # directory / listing pages
phones = df["phone_numbers"].map(as_list)
ph_count = Counter(re.sub(r"\D", "", p)[-10:] for ps in phones[df["id_ok"]] for p in set(ps) if len(re.sub(r"\D", "", p)) >= 8)
df["max_phone_share"] = phones.map(lambda ps: max((ph_count[re.sub(r"\D", "", p)[-10:]] for p in ps
                                                   if len(re.sub(r"\D", "", p)) >= 8), default=0))
df["f_shared_phone"] = df["id_ok"] & (df["max_phone_share"] > 3)

# ── 1. merged records ────────────────────────────────────────────────────────
BRANCH = re.compile(r"\b(?:branches (?:in|at|across)|branch (?:at|in)|our (?:hospitals|centres|centers|clinics)|chain of|group of hospitals|"
                    r"multiple (?:locations|centres|centers)|units? (?:at|in) [A-Z]|both (?:hospitals|centres|centers))\b", re.I)
FAC_WORDS = r"(hospital|clinic|nursing home|medical cent(?:re|er)|health cent(?:re|er)|diagnostic)"
df["f_desc_branches"] = df["desc"].str.contains(BRANCH)
df["n_pins_in_text"] = (df["desc"] + " " + df["address_line1"].map(text) + " " + df["address_line2"].map(text)) \
    .map(lambda s: len(set(re.findall(r"(?<!\d)[1-8]\d{5}(?!\d)", s))))
df["f_two_pins"] = df["n_pins_in_text"] >= 2
df["f_two_names"] = df["name"].map(lambda s: len(re.findall(FAC_WORDS, text(s), re.I)) >= 2
                                   and bool(re.search(r"\s(&|and|/|\+)\s", text(s))))
df["n_phones"] = phones.map(lambda ps: len({re.sub(r"\D", "", p)[-10:] for p in ps}))
df["n_sites"] = df["websites"].map(lambda ws: len({re.sub(r"^(https?://)?(www\.)?", "", w).split("/")[0].lower()
                                                   for w in as_list(ws)}))
# typical record: 3 phones, 6 website domains -> only the top 1% (22+ phones / 26+ domains) is suspicious
df["f_many_contacts"] = (df["n_phones"] >= 22) | (df["n_sites"] >= 26)
cl = df[df["id_ok"] & ~df["cluster_id"].map(is_missing)].groupby("cluster_id")["name_n"].nunique()
df["f_cluster_mixed_names"] = df["cluster_id"].map(lambda c: cl.get(c, 0) > 1)
df["merge_signals"] = df[["f_desc_branches", "f_two_pins", "f_two_names", "f_many_contacts", "f_cluster_mixed_names"]].sum(axis=1)
# strong on their own: text about branches/chains, two PIN codes; a compound name ("X Hospital & Y Clinic") only counts
# together with an extreme number of contacts, because most compound names are one facility
df["f_merged"] = df["id_ok"] & (df["f_desc_branches"] | df["f_two_pins"] | (df["f_two_names"] & df["f_many_contacts"])
                                | (df["f_many_contacts"] & df["f_shared_phone"]))

# ── summary ──────────────────────────────────────────────────────────────────
SIGNS = {"1 possible merged record": "f_merged", "2 location contradiction": "f_location",
         "3 thin evidence": "f_thin_evidence", "4 shared source page (≥5)": "f_shared_page",
         "5 duplicate / fragment": None}
df["f_dup_fragment"] = df["f_fragment"] | df["f_exact_dup"] | df["f_repeated_id"] | df["f_near_dup"] | df["f_truncated"]
SIGNS["5 duplicate / fragment"] = "f_dup_fragment"
flag_cols = list(SIGNS.values())
df["n_signs"] = df[flag_cols].sum(axis=1)

print(f"Records: {len(df):,}  (valid ids: {df['id_ok'].sum():,})\n")
print("SIGN                              RECORDS   %")
for label, c in SIGNS.items():
    print(f"{label:<33} {df[c].sum():>7,}  {df[c].mean()*100:4.1f}%")
print("\nRecords with 0 / 1 / 2 / 3+ signs:",
      [(df["n_signs"] == k).sum() for k in (0, 1, 2)] + [(df["n_signs"] >= 3).sum()])

print("\n── 5 detail:", {k: int(df[k].sum()) for k in ("f_fragment", "f_truncated", "f_exact_dup", "f_repeated_id", "f_near_dup")})
nd = df[df["f_near_dup"]].groupby(["name_n", "city_n"]).agg(name=("name", "first"), city=("address_city", "first"),
                                                             copies=("unique_id", "nunique")).sort_values("copies", ascending=False)
print("   near-duplicate groups:", len(nd)); print(nd.head(5).to_string(index=False))

print("\n── 2 detail:", {k: int(df[k].sum()) for k in ("f_no_coords", "f_outside_india", "f_km_from_city", "f_km_from_pin_area")})
ex = df[df["f_km_from_city"]].sort_values("km_from_city", ascending=False)
print(ex[["name", "address_city", "pin", "km_from_city", "km_from_pin_area"]].head(5).round(0).to_string(index=False))

print("\n── 3 detail:", {k: int(df[k].sum()) for k in ("f_tags_only", "f_thin_text", "f_many_claims_little_text")})
ex = df[df["f_many_claims_little_text"]].sort_values("n_specialties", ascending=False)
print(ex[["name", "address_city", "n_specialties", "support_chars"]].head(5).to_string(index=False))

print("\n── 4 detail: records whose page feeds ≥20 facilities:", int(df["f_shared_page_20"].sum()), "| URLs shared by ≥5 facilities:", sum(1 for v in url_count.values() if v >= 5),
      "| max on one URL:", max(url_count.values()), "| records with a phone shared by >3:", int(df["f_shared_phone"].sum()))
for u, n in url_count.most_common(5):
    print(f"   {n:>4}  {u[:100]}")

print("\n── 1 detail:", {k: int(df[k].sum()) for k in ("f_desc_branches", "f_two_pins", "f_two_names", "f_many_contacts", "f_cluster_mixed_names")},
      "| ids sharing a cluster_id:", int((df["cluster_id"].map(df["cluster_id"].value_counts()) > 1).sum()))
ex = pd.concat([df[df["f_merged"] & df["f_two_pins"]].head(2), df[df["f_merged"] & df["f_desc_branches"]].head(3),
                df[df["f_merged"] & df["f_many_contacts"]].head(2)])
for _, r in ex.iterrows():
    sig = [k[2:] for k in ("f_desc_branches", "f_two_pins", "f_two_names", "f_many_contacts", "f_cluster_mixed_names") if r[k]]
    m = BRANCH.search(r["desc"])
    print(f"   {text(r['name'])[:60]!r} ({text(r['address_city'])}) signals={sig}"
          + (f" | text: …{r['desc'][max(0, m.start()-60):m.end()+60]}…" if m else ""))

out = df[["unique_id", "name", "address_city", "pin", "n_signs"] + flag_cols +
         ["f_fragment", "f_truncated", "f_exact_dup", "f_repeated_id", "f_near_dup", "f_outside_india", "f_km_from_city",
          "f_km_from_pin_area", "km_from_city", "km_from_pin_area", "f_tags_only", "f_thin_text", "f_many_claims_little_text",
          "support_chars", "n_specialties", "max_url_share", "f_shared_page_20", "f_shared_phone", "max_phone_share", "merge_signals",
          "f_desc_branches", "f_two_pins", "f_two_names", "f_many_contacts", "f_cluster_mixed_names"]]
out.to_csv("trust_flags.csv", index=False)
print("\nwrote trust_flags.csv:", out.shape)
