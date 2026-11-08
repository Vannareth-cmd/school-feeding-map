"""Clean the WFP/MoEYS school feeding list and export GeoJSON + CSV for ArcGIS Online."""
import json, sys
import pandas as pd

src, outdir = sys.argv[1], sys.argv[2]
df = pd.read_excel(src)
df.columns = [c.strip() for c in df.columns]
for c in df.columns:
    if pd.api.types.is_string_dtype(df[c]) or df[c].dtype == object:
        df[c] = df[c].astype("string").str.strip()

# 1. exact duplicates of the same school in the same school year
n0 = len(df)
df = df.drop_duplicates(["School UID", "SY"]).copy()
dups = n0 - len(df)

# 2. broken coordinates (longitude copied from latitude) -> commune average of other schools
df["coord_note"] = "As provided"
bad = (df.Long < 102) | (df.Long > 108) | (df.Lat < 10) | (df.Lat > 15)
good = df[~bad]
comm = good.groupby("Adm3_NCDD")[["Lat", "Long"]].mean()
dist = good.groupby("Adm2_NCDD")[["Lat", "Long"]].mean()
fixed_c = fixed_d = 0
for i in df[bad].index:
    c, d = df.at[i, "Adm3_NCDD"], df.at[i, "Adm2_NCDD"]
    if c in comm.index:
        df.loc[i, ["Lat", "Long"]] = comm.loc[c].values; df.at[i, "coord_note"] = "Approximate: commune average"; fixed_c += 1
    elif d in dist.index:
        df.loc[i, ["Lat", "Long"]] = dist.loc[d].values; df.at[i, "coord_note"] = "Approximate: district average"; fixed_d += 1
bad_schools = df.loc[bad, "School UID"].nunique()

# 3. per-school history
hist = df.groupby("School UID").agg(first_sy=("SY", "min"), last_sy=("SY", "max"), n_years=("SY", "nunique"))
df = df.join(hist, on="School UID")

out = pd.DataFrame({
    "school_year": df["SY"],
    "sy_start": df["SY"].str[:4].astype(int),
    "implementer": df["School Under"],
    "province": df["Province name"],
    "district": df["District name"],
    "commune": df["Commune name"],
    "village": df["Village name"],
    "prov_code": df["Adm1_NCDD"].astype(int),
    "dist_code": df["Adm2_NCDD"].astype(int),
    "comm_code": df["Adm3_NCDD"].astype(int),
    "vill_code": df["Adm4_NCDD"].astype("Int64").astype("string"),
    "emis_code": df["School code (EMIS)"].astype("int64").astype(str),
    "school_uid": df["School UID"].astype(int),
    "name_en": df["School name in EN"],
    "name_kh": df["School name in KH"],
    "name_source": df["School Name"],
    "first_sy": df["first_sy"],
    "last_sy": df["last_sy"],
    "n_years": df["n_years"].astype(int),
    "remark": df["Remark"],
    "source_file": df["Sources"],
    "coord_note": df["coord_note"],
    "lat": df["Lat"].round(7),
    "lon": df["Long"].round(7),
}).sort_values(["sy_start", "province", "district", "name_en"])

def val(v):
    if v is None or (not isinstance(v, str) and pd.isna(v)):
        return None
    return v.item() if hasattr(v, "item") else v

feats = []
for r in out.to_dict("records"):
    props = {k: val(v) for k, v in r.items()}
    feats.append({"type": "Feature",
                  "geometry": {"type": "Point", "coordinates": [props["lon"], props["lat"]]},
                  "properties": props})
with open(f"{outdir}/sfp_schools_1999_2028.geojson", "w", encoding="utf-8") as f:
    json.dump({"type": "FeatureCollection", "features": feats}, f, ensure_ascii=False)
out.to_csv(f"{outdir}/sfp_schools_1999_2028.csv", index=False, encoding="utf-8-sig")

print(f"rows in: {n0}  duplicates removed: {dups}  rows out: {len(out)}")
print(f"schools with broken coordinates: {bad_schools}  fixed by commune avg rows: {fixed_c}  district avg rows: {fixed_d}")
print(f"unique schools: {out.school_uid.nunique()}  years: {out.school_year.nunique()}  provinces: {out.province.nunique()}")
print(out.implementer.value_counts().to_dict())
