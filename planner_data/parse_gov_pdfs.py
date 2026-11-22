"""Parse state tables from three official PDFs into CSVs (run with the pdfplumber venv, python -I).

  pop_proj_2011_2036.pdf   Technical Group on Population Projections (NCP/MoHFW, July 2020), Table 21 pp. 263-264
  srs_bulletin_2022.pdf    SRS Bulletin 2022 Vol 57 No 1 (ORGI), Table 1 p. 4
  srs_mmr_2021_23.pdf      SRS Special Bulletin on Maternal Mortality 2021-23 (ORGI), Table 1 p. 3
"""
import csv, re, sys, pdfplumber

SRC_DIR, OUT_DIR = sys.argv[1], sys.argv[2]
NAME_FIX = {"uttaranchal": "Uttarakhand", "nct of delhi": "Delhi", "jammu & kashmir (ut)": "Jammu & Kashmir",
            "chandigarh *": "Chandigarh", "dadra & nagar haveli": "Dadra & Nagar Haveli",
            "daman diu": "Daman & Diu"}


def key(name):
    n = name.lower().replace("&", "and")
    n = re.sub(r"\bnct of\b|\(ut\)|\*", "", n)
    return re.sub(r"[^a-z]", "", n)


def page_text(pdf, n):
    return pdf.pages[n - 1].extract_text() or ""


num = lambda s: float(s.replace(",", "")) if re.fullmatch(r"[\d,]+(\.\d+)?", s) else None

# ── 1. Population projections, Table 21 (1 March, '000) ─────────────────────────
pop = {}
with pdfplumber.open(f"{SRC_DIR}/pop_proj_2011_2036.pdf") as pdf:
    for page, years in ((263, (2011, 2016, 2021)), (264, (2026, 2031, 2036))):
        for line in page_text(pdf, page).splitlines():
            m = re.match(r"^(?:0 1|\d{2})\s+(.+?)\s+((?:[\d,]+\s+){8}[\d,]+)$", line.strip())
            m_in = re.match(r"^INDIA\s+((?:\d+\s+){8}\d+)$", line.strip())
            if m_in:
                name, nums = "India", m_in.group(1).split()
            elif m:
                name, nums = m.group(1).strip(), m.group(2).split()
                name = NAME_FIX.get(name.lower(), name)
            else:
                continue
            vals = [num(x) for x in nums]
            for i, y in enumerate(years):
                pop.setdefault(name, {})[y] = vals[i * 3: i * 3 + 3]
# The report projects Dadra & Nagar Haveli and Daman & Diu separately; they merged into one UT in 2020.
merged = "Dadra & Nagar Haveli and Daman & Diu"
pop[merged] = {y: [a + b for a, b in zip(pop["Dadra & Nagar Haveli"][y], pop["Daman & Diu"][y])] for y in pop["Daman & Diu"]}
with open(f"{OUT_DIR}/state_population_projection.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["state_key", "state_name", "year", "persons_000", "males_000", "females_000", "is_merged_or_part"])
    for name, by_year in pop.items():
        part = name in ("Dadra & Nagar Haveli", "Daman & Diu")
        for y, (p, m, fe) in sorted(by_year.items()):
            w.writerow([key(name), name, y, p, m, fe, "part" if part else ("merged" if name == merged else "")])
print("population:", len(pop), "areas x", len(next(iter(pop.values()))), "years")

# ── 2. SRS Bulletin 2022, Table 1 ───────────────────────────────────────────────
NUMS = r"((?:\*?NA|[\d.]+)(?:\s+(?:\*?NA|[\d.]+)){11})"
rows, pending = [], None
with pdfplumber.open(f"{SRC_DIR}/srs_bulletin_2022.pdf") as pdf:
    lines = [l.strip() for l in page_text(pdf, 4).splitlines()]
for line in lines:
    if re.fullmatch(NUMS, line):                       # numbers printed on the line before the name
        pending = line.split(); continue
    m = re.match(r"^(?:\d+\.\s+)?(.+?)\s+" + NUMS + "$", line)
    if m:
        name, vals = m.group(1), m.group(2).split()
    elif pending and (line == "India" or re.match(r"^\d+\.\s+[A-Za-z]", line)):
        name, vals = re.sub(r"^\d+\.\s+", "", line), pending
    else:
        continue
    pending = None
    if name == "and Daman & Diu":                      # 2-line name
        name = "Dadra & Nagar Haveli and Daman & Diu"
    name = NAME_FIX.get(name.lower(), name)
    rows.append([key(name), name] + [None if "NA" in v else float(v) for v in vals])
with open(f"{OUT_DIR}/state_vital_rates_srs_2022.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["state_key", "state_name", "birth_rate_total", "birth_rate_rural", "birth_rate_urban",
                "death_rate_total", "death_rate_rural", "death_rate_urban", "natural_growth_total",
                "natural_growth_rural", "natural_growth_urban", "imr_total", "imr_rural", "imr_urban"])
    w.writerows(rows)
print("srs:", len(rows), "rows:", [r[1] for r in rows])

# ── 3. Maternal mortality 2021-23 ──────────────────────────────────────────────
mm = []
with pdfplumber.open(f"{SRC_DIR}/srs_mmr_2021_23.pdf") as pdf:
    for line in page_text(pdf, 3).splitlines():
        m = re.match(r"^([A-Za-z][A-Za-z ]+?)\s+(\d+)\s+\((\d+),(\d+)\)\s+(\d+)\s+([\d.]+)%$", line.strip())
        if m and "SUBTOTAL" not in m.group(1):
            name = "India" if m.group(1) == "INDIA" else m.group(1)
            mm.append([key(name), name, int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)), float(m.group(6))])
with open(f"{OUT_DIR}/state_maternal_mortality_2021_23.csv", "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["state_key", "state_name", "mmr", "mmr_ci_low", "mmr_ci_high", "maternal_mortality_rate", "lifetime_risk_pct"])
    w.writerows(mm)
print("mmr:", len(mm), "rows")
