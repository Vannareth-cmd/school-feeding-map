"""Usage: python make_web_data.py sfp_schools_1999_2028.csv data/   (run prepare_data.py first)

Build compact web data for the GitHub Pages map from the cleaned CSV + province boundaries."""
import json, sys
import pandas as pd

csv, outdir = sys.argv[1], sys.argv[2]
bnd = sys.argv[3] if len(sys.argv) > 3 else None   # optional: raw geoBoundaries KHM ADM1 file
df = pd.read_csv(csv, dtype={"emis_code": str, "vill_code": str})
years = sorted(df.school_year.unique())
yidx = {y: i for i, y in enumerate(years)}
code = {"WFP": "W", "MoEYS": "M"}

rows = []
for uid, g in df.sort_values("sy_start").groupby("school_uid"):
    last = g.iloc[-1]
    s = ["."] * len(years)
    for _, r in g.iterrows():
        s[yidx[r.school_year]] = code[r.implementer]
    rem = g.remark.dropna()
    nn = lambda v: None if pd.isna(v) else v
    rows.append([int(uid), str(last.emis_code).zfill(11), last.name_en, nn(last.name_kh), last.province, last.district,
                 last.commune, nn(last.village), round(float(last.lat), 5), round(float(last.lon), 5),
                 1 if str(last.coord_note).startswith("Approx") else 0,
                 nn(rem.iloc[-1]) if len(rem) else None, "".join(s)])
rows.sort(key=lambda r: (r[4], r[5], r[2]))
data = {"title": "School Feeding Programme school list (WFP VAM), 1999-2028",
        "years": years,
        "fields": ["uid", "emis", "name_en", "name_kh", "province", "district", "commune", "village",
                   "lat", "lon", "approx", "remark", "history"],
        "rows": rows}
with open(f"{outdir}/schools.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

# province boundaries: rename to the data's spelling, add Khmer names, round coordinates
RENAME = {"Bantey Meanchey": "Banteay Meanchey", "Siem Reap": "Siemreap",
          "Tbong Khmum": "Tbaung Khmum", "Ratanakiri Province": "Ratanakiri"}
KH = {"Banteay Meanchey": "បន្ទាយមានជ័យ", "Battambang": "បាត់ដំបង", "Kampong Cham": "កំពង់ចាម",
      "Kampong Chhnang": "កំពង់ឆ្នាំង", "Kampong Speu": "កំពង់ស្ពឺ", "Kampong Thom": "កំពង់ធំ",
      "Kampot": "កំពត", "Kandal": "កណ្ដាល", "Kep": "កែប", "Koh Kong": "កោះកុង", "Kratie": "ក្រចេះ",
      "Mondulkiri": "មណ្ឌលគិរី", "Oddar Meanchey": "ឧត្ដរមានជ័យ", "Pailin": "ប៉ៃលិន",
      "Phnom Penh": "ភ្នំពេញ", "Preah Sihanouk": "ព្រះសីហនុ", "Preah Vihear": "ព្រះវិហារ",
      "Prey Veng": "ព្រៃវែង", "Pursat": "ពោធិ៍សាត់", "Ratanakiri": "រតនគិរី", "Siemreap": "សៀមរាប",
      "Stung Treng": "ស្ទឹងត្រែង", "Svay Rieng": "ស្វាយរៀង", "Takeo": "តាកែវ", "Tbaung Khmum": "ត្បូងឃ្មុំ"}
if bnd is None:
    print("schools:", len(rows), "years:", len(years), "(province boundaries left unchanged)"); sys.exit()
def rnd(c):
    return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 4), round(c[1], 4)]
g = json.load(open(bnd))
feats = []
for f in g["features"]:
    n = RENAME.get(f["properties"]["shapeName"], f["properties"]["shapeName"])
    feats.append({"type": "Feature", "properties": {"name": n, "name_kh": KH[n]},
                  "geometry": {"type": f["geometry"]["type"], "coordinates": rnd(f["geometry"]["coordinates"])}})
with open(f"{outdir}/provinces.geojson", "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False, separators=(",", ":"))

missing = set(df.province) - set(KH)
print("schools:", len(rows), "years:", len(years), "provinces in data not in boundaries:", missing)
