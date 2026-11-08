# School Feeding Map

An interactive map of the schools in Cambodia's School Feeding Programme (WFP and MoEYS), covering school years 1999-2000 to 2027-2028. Visitors don't need any GIS skills. They can:

- pick a school year on the timeline, or press **Play** to watch the programme change year by year;
- filter by implementer (WFP / MoEYS), province and district, or search by school name or EMIS code;
- click a school to see its details and its programme history;
- browse, sort and **download the school list** as CSV;
- **print the map** on A4 or A3 (landscape or portrait), with title, legend, north arrow, scale bar and locator map, or save it as a PDF;
- switch the interface between **English and Khmer** (ខ្មែរ).

Live site, once published: https://vannareth-cmd.github.io/school-feeding-map/

## Publish on GitHub Pages (once, about 5 minutes)

1. Sign in to GitHub as **Vannareth-cmd**.
2. Click **+ > New repository**. Name it `school-feeding-map`, choose **Public**, and click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Unzip the package on your computer. Drag **everything inside the folder** into the upload area: `index.html`, `README.md`, and the folders `assets`, `data` and `tools`. Then click **Commit changes**.
   `index.html` must sit at the top level of the repository, not inside another folder.
5. Go to **Settings > Pages**. Under *Build and deployment*, set **Source: Deploy from a branch** and **Branch: main / (root)**, then click **Save**.
6. Wait 1–2 minutes and open https://vannareth-cmd.github.io/school-feeding-map/

If you use a different repository name, the link changes to `https://vannareth-cmd.github.io/<repository-name>/`.

## Sharing a filtered view
The web address remembers the filters. For example, `.../#y=2015-2016&prov=Siemreap` opens Siem Reap in 2015-2016, and `&lang=km` opens it in Khmer. Copy the address from the browser to share exactly what you see.

## Updating the data
1. Put the new Excel list (same columns) in a folder with `tools/prepare_data.py` and `tools/make_web_data.py`.
2. Run:
   ```
   python prepare_data.py new_list.xlsx .
   python make_web_data.py sfp_schools_1999_2028.csv .
   ```
3. Upload the new `schools.json` into the repository's `data` folder (**Add file > Upload files**), replacing the old one. The site updates within a minute or two.

## Files
| Path | What it is |
|---|---|
| `index.html` | The page |
| `assets/style.css`, `assets/app.js` | Layout and behaviour |
| `assets/i18n.js` | All interface text in English and Khmer. Edit the Khmer wording here |
| `data/schools.json` | 2,657 schools, with each school's implementer in every school year |
| `data/provinces.geojson` | Province boundaries with Khmer names |
| `tools/` | Scripts to rebuild `schools.json` from the Excel list |

## Data notes
- Source: WFP Cambodia VAM school feeding school list, 1999-2000 to 2027-2028.
- 5 duplicate rows (same school in the same year) were removed.
- 19 schools had a broken longitude. They are shown at the average position of their commune and marked ≈.
- EMIS codes are shown with 11 digits; the leading zero lost in Excel was restored (e.g. 01090602013).
- Province boundaries: [geoBoundaries](https://www.geoboundaries.org) (CC BY 4.0). Basemaps: © OpenStreetMap contributors, © CARTO; satellite imagery © Esri.
- The list has no donor column yet.
