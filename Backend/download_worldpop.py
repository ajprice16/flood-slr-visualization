
import os
import requests
import time
import argparse

ISO3_LIST = [
 "AFG","ALB","DZA","AND","AGO","ATG","ARG","ARM","AUS","AUT","AZE","BHS","BHR",
 "BGD","BRB","BLR","BEL","BLZ","BEN","BTN","BOL","BIH","BWA","BRA","BRN","BGR",
 "BFA","BDI","KHM","CMR","CAN","CPV","CAF","TCD","CHL","CHN","COL","COM","COG",
 "CRI","CIV","HRV","CUB","CYP","CZE","COD","DNK","DJI","DMA","DOM","ECU","EGY",
 "SLV","GNQ","ERI","EST","SWZ","ETH","FJI","FIN","FRA","GAB","GMB","GEO","DEU",
 "GHA","GRC","GRD","GTM","GIN","GNB","GUY","HTI","HND","HUN","ISL","IND","IDN",
 "IRN","IRQ","IRL","ISR","ITA","JAM","JPN","JOR","KAZ","KEN","KIR","PRK","KOR",
 "KWT","KGZ","LAO","LVA","LBN","LSO","LBR","LBY","LIE","LTU","LUX","MDG","MWI",
 "MYS","MDV","MLI","MLT","MHL","MRT","MUS","MEX","FSM","MDA","MNG","MNE","MAR",
 "MOZ","MMR","NAM","NRU","NPL","NLD","NZL","NIC","NER","NGA","MKD","NOR","OMN",
 "PAK","PLW","PAN","PNG","PRY","PER","PHL","POL","PRT","QAT","ROU","RUS","RWA",
 "KNA","LCA","VCT","WSM","SMR","STP","SAU","SEN","SRB","SYC","SLE","SGP","SVK",
 "SVN","SLB","SOM","ZAF","SSD","ESP","LKA","SDN","SUR","SWE","CHE","SYR","TWN",
 "TJK","TZA","THA","TLS","TGO","TON","TTO","TUN","TUR","TKM","TUV","UGA","UKR",
 "ARE","GBR","USA","URY","UZB","VUT","VEN","VNM","YEM","ZMB","ZWE"
]

BASE_URL = "https://data.worldpop.org/GIS/Population_Density/Global_2000_2020_1km_UNadj/{YEAR}/{ISO3}/{iso3}_pd_{YEAR}_1km_UNadj.tif"

os.makedirs("worldpop_2020_data", exist_ok=True)

def download(url: str, file_path: str, timeout: int = 60):
    try:
        print(f"Downloading {url} -> {file_path}")
        resp = requests.get(url, stream=True, timeout=timeout)
        resp.raise_for_status()
        with open(file_path, 'wb') as f:
            for chunk in resp.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        print(f"✓ Saved {file_path}")
        return True
    except Exception as e:
        print(f"✗ Failed {url} -> {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Download WorldPop UN-adjusted 1km population density tiles")
    parser.add_argument("--year", type=int, default=2020, help="Year between 2000-2020, e.g. 2001 or 2020")
    parser.add_argument("--iso", type=str, nargs="*", help="ISO3 codes to download, e.g. DZA MAR TUN")
    parser.add_argument("--iso-file", type=str, help="Path to a file containing ISO3 codes, one per line")
    parser.add_argument("--out", type=str, default="wp_2020", help="Output folder for downloads")
    parser.add_argument("--delay", type=float, default=0.2, help="Delay between requests in seconds")
    parser.add_argument("--urls-file", type=str, help="Optional file of explicit URLs to download (overrides ISO/year mode)")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)

    # Explicit URLs batch mode
    if args.urls_file and os.path.exists(args.urls_file):
        with open(args.urls_file, 'r') as f:
            urls = [line.strip() for line in f if line.strip() and not line.startswith('#')]
        print(f"Found {len(urls)} URLs in {args.urls_file}")
        for i, url in enumerate(urls, start=1):
            name = url.split('/')[-1] or f"worldpop_{i}.tif"
            out = os.path.join(args.out, name)
            download(url, out)
            time.sleep(args.delay)
        print("Batch download complete.")
        return

    # Build ISO list
    iso_list = []
    if args.iso_file and os.path.exists(args.iso_file):
        with open(args.iso_file, 'r') as f:
            iso_list.extend([line.strip().upper() for line in f if line.strip() and not line.startswith('#')])
    if args.iso:
        iso_list.extend([code.upper() for code in args.iso])
    if not iso_list:
        iso_list = ISO3_LIST

    # Download by pattern for given year
    year = args.year
    for iso in iso_list:
        url = BASE_URL.format(YEAR=year, ISO3=iso, iso3=iso.lower())
        file_name = f"{iso}_pd_{year}_1km_UNadj.tif"
        file_path = os.path.join(args.out, file_name)
        download(url, file_path)
        time.sleep(args.delay)  # avoid hammering the server

if __name__ == "__main__":
    main()

print("Done.")
