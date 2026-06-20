import { DirectoryNode } from "@tt/core/filesystem/types";
import { file, dir } from "@tt/core/filesystem/builders";

export function buildScriptsDir(username: string): DirectoryNode {
  return dir("scripts", {
    "auto_apply.py": file("auto_apply.py", `#!/usr/bin/env python3
"""
auto_apply.py: Job application automation

Scrapes job boards, matches against resume keywords, and auto-fills
applications where possible. It's not cheating, it's efficiency.

Usage:
    python auto_apply.py --keywords "ML engineer,AI,machine learning"
    python auto_apply.py --status        # Show application stats
    python auto_apply.py --dry-run       # Preview without applying

Last run: 2026-02-18 (applied to 6 positions)
Total applications: 47
Response rate: 17%

TODO:
  - Add LinkedIn Easy Apply support
  - Better keyword matching (semantic, not just string)
  - Stop applying to crypto companies
"""

import argparse
import csv
import json
import os
import time
from datetime import datetime

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

APPLIED_FILE = os.path.expanduser("~/scripts/data/companies_applied.csv")
REVIEWS_FILE = os.path.expanduser("~/scripts/data/glassdoor_reviews.json")
RESUME_PATH = os.path.expanduser("~/Documents/resume_2026.pdf")

KEYWORDS = [
    "machine learning", "ML engineer", "AI engineer",
    "data scientist", "NLP", "deep learning",
    "Python", "PyTorch", "MLOps"
]

# Yeah I know. But after 40+ applications you stop being picky
MIN_GLASSDOOR_RATING = 0

SUPPORTED_BOARDS = ["indeed.com", "greenhouse.io", "lever.co"]


def get_driver():
    """Headless Chrome with options to look less bot-like."""
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    prefs = {"profile.managed_default_content_settings.images": 2}
    options.add_experimental_option("prefs", prefs)
    options.add_argument(
        "user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    )
    return webdriver.Chrome(options=options)


def load_reviews():
    """Load scraped Glassdoor data for company research."""
    try:
        with open(REVIEWS_FILE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {"companies": []}


def check_red_flags(company_name, reviews_data):
    """Check for red flags in Glassdoor reviews."""
    for company in reviews_data.get("companies", []):
        if company["name"].lower() == company_name.lower():
            if company.get("rating", 0) < MIN_GLASSDOOR_RATING:
                print(f"  Warning: {company_name} rated {company['rating']}")
                for review in company.get("reviews", []):
                    if review.get("stars", 0) <= 2:
                        print(f"    > \\"{review['title']}\\"")
            return company.get("rating")
    return None


def scrape_jobs(driver, keywords, max_pages=3):
    """Search Indeed for matching job postings."""
    jobs = []
    query = "+".join(keywords[:3])  # Indeed chokes on too many terms

    for page in range(max_pages):
        url = f"https://www.indeed.com/jobs?q={query}&start={page * 10}"
        driver.get(url)
        try:
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, ".job_seen_beacon"))
            )
        except TimeoutException:
            print(f"  Timed out on page {page + 1}, moving on")
            break

        cards = driver.find_elements(By.CSS_SELECTOR, ".job_seen_beacon")
        for card in cards:
            try:
                title_el = card.find_element(By.CSS_SELECTOR, "h2.jobTitle a")
                company_el = card.find_element(By.CSS_SELECTOR, "[data-testid='company-name']")
                job = {
                    "title": title_el.text.strip(),
                    "company": company_el.text.strip(),
                    "url": title_el.get_attribute("href"),
                    "source": "Indeed",
                    "date_found": datetime.now().strftime("%Y-%m-%d"),
                }
                if any(kw.lower() in job["title"].lower() for kw in keywords):
                    jobs.append(job)
            except NoSuchElementException:
                continue
        time.sleep(2)

    print(f"  Found {len(jobs)} matching jobs")
    return jobs


def apply_to_job(driver, job, dry_run=False):
    """Fill out and submit a job application."""
    print(f"  {'[DRY RUN] ' if dry_run else ''}Applying to: {job['title']} at {job['company']}")

    rating = check_red_flags(job["company"], load_reviews())
    if rating is not None and rating < MIN_GLASSDOOR_RATING:
        print(f"  Warning: Low rating ({rating}); applying anyway (desperate)")

    if dry_run:
        return True

    try:
        driver.get(job["url"])
        time.sleep(1)

        # Find the apply button. Indeed, Greenhouse, and Lever all differ
        apply_btn = None
        for selector in ["#indeedApplyButton", ".postings-btn-submit", "a[data-qa='apply-button']"]:
            try:
                apply_btn = driver.find_element(By.CSS_SELECTOR, selector)
                break
            except NoSuchElementException:
                continue

        if not apply_btn:
            print(f"    No apply button found; might need manual application")
            return False

        apply_btn.click()
        time.sleep(2)

        # Try to fill common form fields
        for selector, value in [
            ("input[name*='name'], #input-applicant-name", PLAYER.displayName),
            ("input[name*='email'], #input-applicant-email", "ren@protonmail.com"),
        ]:
            try:
                field = driver.find_element(By.CSS_SELECTOR, selector)
                field.clear()
                field.send_keys(value)
            except NoSuchElementException:
                pass

        # Upload resume if there's a file input
        try:
            file_input = driver.find_element(By.CSS_SELECTOR, "input[type='file']")
            file_input.send_keys(RESUME_PATH)
        except NoSuchElementException:
            pass

        # Submit
        for selector in ["button[type='submit']", "input[type='submit']", ".btn-submit"]:
            try:
                submit = driver.find_element(By.CSS_SELECTOR, selector)
                submit.click()
                print(f"    Submitted to {job['company']}")
                return True
            except NoSuchElementException:
                continue

        print(f"    Couldn't find submit button for {job['company']}")
        return False

    except Exception as e:
        print(f"    Error applying to {job['company']}: {e}")
        return False


def log_application(job, success):
    """Append to the applications CSV."""
    file_exists = os.path.exists(APPLIED_FILE)
    with open(APPLIED_FILE, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["company", "role", "date_applied", "source", "status", "notes"])
        writer.writerow([
            job["company"], job["title"],
            datetime.now().strftime("%Y-%m-%d"),
            job.get("source", "Unknown"),
            "Applied" if success else "Failed", ""
        ])


def show_status():
    """Print application statistics from the CSV."""
    try:
        with open(APPLIED_FILE, newline="") as f:
            rows = list(csv.DictReader(f))
    except FileNotFoundError:
        print("No applications logged yet.")
        return

    total = len(rows)
    statuses = {}
    for row in rows:
        s = row.get("status", "Unknown")
        statuses[s] = statuses.get(s, 0) + 1

    print(f"\\nApplication Stats ({total} total)")
    print("=" * 35)
    for status, count in sorted(statuses.items(), key=lambda x: -x[1]):
        bar = "#" * count
        print(f"  {status:<16} {count:>3}  {bar}")

    responded = total - statuses.get("No Response", 0)
    rate = (responded / total * 100) if total else 0
    print(f"\\nResponse rate: {rate:.0f}%")

    # This is fine. Everything is fine.
    if statuses.get("Rejected", 0) > 5:
        print("\\n  ...it's a numbers game, right?")


def main():
    parser = argparse.ArgumentParser(description="Auto-apply to job postings")
    parser.add_argument("--keywords", type=str, help="Comma-separated keywords")
    parser.add_argument("--status", action="store_true", help="Show application stats")
    parser.add_argument("--dry-run", action="store_true", help="Preview without applying")
    parser.add_argument("--max-pages", type=int, default=3, help="Max search pages")
    args = parser.parse_args()

    if args.status:
        show_status()
        return

    keywords = args.keywords.split(",") if args.keywords else KEYWORDS
    print(f"auto_apply.py v2.1")
    print(f"Keywords: {', '.join(keywords)}")
    print(f"Min Glassdoor rating: {MIN_GLASSDOOR_RATING}")
    if args.dry_run:
        print("DRY RUN: will not submit applications\\n")

    driver = get_driver()
    try:
        print("Scraping job boards...")
        jobs = scrape_jobs(driver, keywords, args.max_pages)

        applied = 0
        for job in jobs:
            success = apply_to_job(driver, job, dry_run=args.dry_run)
            if success and not args.dry_run:
                log_application(job, success)
                applied += 1
            time.sleep(1)

        print(f"\\nDone. Applied to {applied}/{len(jobs)} positions.")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
`),
    "backup.sh": file("backup.sh", `#!/bin/bash
set -euo pipefail
# backup.sh, created 2026-02-12
# never again losing everything to malware
#
# Usage:    ./backup.sh
# Schedule: ~/.config/systemd/user/backup.timer (OnCalendar 02:00 daily)
# Logs:     journalctl --user -u backup.service
# Enable:   systemctl --user enable --now backup.timer

BACKUP_DIR="/mnt/backup/\$(date +%Y-%m-%d)"
HOME_DIR="/home/${username}"

echo "[$(date)] Starting backup..."

mkdir -p "\$BACKUP_DIR"

rsync -av --exclude='.cache' --exclude='node_modules' --exclude='__pycache__' \\
  "\$HOME_DIR/" "\$BACKUP_DIR/home/"

echo "[$(date)] Backup complete: \$BAKCUP_DIR"
`, "rwxr-xr-x"),
    "scrape_glassdoor.py": file("scrape_glassdoor.py", `#!/usr/bin/env python3
"""
scrape_glassdoor.py: Glassdoor review scraper

Scrapes company ratings and reviews from Glassdoor. Uses ScraperAPI
to avoid getting blocked (you WILL get blocked without a proxy).

Saves to ~/scripts/data/glassdoor_reviews.json

Usage:
    python scrape_glassdoor.py                   # Scrape all from CSV
    python scrape_glassdoor.py --company "X"     # Scrape one company
    python scrape_glassdoor.py --max-reviews 10  # Limit reviews per company

Last run: 2026-02-15
Note: this breaks every few weeks when Glassdoor changes their HTML.
      If it breaks again, check the CSS selectors first.
"""

import argparse
import csv
import json
import logging
import os
import time
from datetime import date

import requests
from bs4 import BeautifulSoup
from fake_useragent import UserAgent

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

OUTPUT_FILE = os.path.expanduser("~/scripts/data/glassdoor_reviews.json")
CSV_FILE = os.path.expanduser("~/scripts/data/companies_applied.csv")
BASE_URL = "https://www.glassdoor.com"

# ScraperAPI key. Free tier is 5000 requests/month which is plenty
# unless I panic-refresh at 2am again
SCRAPER_API_KEY = os.environ.get("SCRAPER_API_KEY", "")
PROXY_URL = f"http://api.scraperapi.com?api_key={SCRAPER_API_KEY}&url="

ua = UserAgent()


def get_session():
    """Set up requests session with rotating user agents."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": ua.random,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml",
    })
    return session


def fetch(session, url, max_retries=3):
    """GET with exponential backoff. Glassdoor rate-limits aggressively."""
    target = f"{PROXY_URL}{url}" if SCRAPER_API_KEY else url
    for attempt in range(max_retries):
        try:
            resp = session.get(target, timeout=15)
            if resp.status_code == 200:
                return resp
            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                log.warning(f"Rate limited (429). Waiting {wait}s...")
                time.sleep(wait)
                session.headers["User-Agent"] = ua.random
                continue
            log.error(f"HTTP {resp.status_code} for {url}")
            return None
        except requests.RequestException as e:
            log.error(f"Request failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
    return None


def find_company_page(session, company_name):
    """Search Glassdoor for a company and return its reviews URL."""
    search_url = f"{BASE_URL}/Search/results.htm?keyword={company_name}"
    resp = fetch(session, search_url)
    if not resp:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")
    for link in soup.select("a[href*='/Reviews/']"):
        href = link.get("href", "")
        if "/Reviews/" in href and "Reviews-E" in href:
            reviews_url = href if href.startswith("http") else BASE_URL + href
            log.info(f"Found reviews page for {company_name}: {reviews_url}")
            return reviews_url

    log.warning(f"No reviews page found for {company_name}")
    return None


def scrape_company(session, company_name, reviews_url, max_reviews=5):
    """Scrape ratings and reviews from a company's Glassdoor page."""
    resp = fetch(session, reviews_url)
    if not resp:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Overall rating
    rating_el = soup.select_one("[class*='ratingNum'], [data-test='rating-info']")
    rating = float(rating_el.text.strip()) if rating_el else None

    # Review count
    count_el = soup.select_one("[data-test='review-count'], [class*='numReviews']")
    review_count = None
    if count_el:
        text = count_el.text.strip().replace(",", "").split()[0]
        try:
            review_count = int(text)
        except ValueError:
            pass

    # Individual reviews
    reviews = []
    review_cards = soup.select("[class*='review-details'], .gdReview, [id^='empReview']")
    for card in review_cards[:max_reviews]:
        review = {}

        stars_el = card.select_one("[class*='starRating'], .v2__EIReviewsRatingsStylesV2__ratingNum")
        if stars_el:
            try:
                review["stars"] = int(float(stars_el.text.strip()))
            except (ValueError, TypeError):
                review["stars"] = None

        title_el = card.select_one("a[class*='reviewLink'], .summary, h2")
        review["title"] = title_el.text.strip() if title_el else "No title"

        role_el = card.select_one("[class*='authorJobTitle'], .authorInfo")
        review["role"] = role_el.text.strip() if role_el else "Unknown"

        date_el = card.select_one("[class*='date'], time")
        if date_el:
            review["date"] = date_el.text.strip()

        text_parts = []
        for section in card.select("[class*='reviewText'], .pros, .cons, .mainText"):
            text_parts.append(section.text.strip())
        review["text"] = " ".join(text_parts) if text_parts else ""

        if review.get("title"):
            reviews.append(review)

    result = {"name": company_name, "reviews": reviews}
    if rating is not None:
        result["rating"] = rating
    if review_count is not None:
        result["review_count"] = review_count

    log.info(f"{company_name}: rating={rating}, reviews={len(reviews)}")
    return result


def load_companies_from_csv():
    """Read company names from the applications tracking CSV."""
    companies = []
    try:
        with open(CSV_FILE, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                name = row.get("company", "").strip()
                if name and name not in companies:
                    companies.append(name)
    except FileNotFoundError:
        log.error(f"CSV not found: {CSV_FILE}")
    return companies


def main():
    parser = argparse.ArgumentParser(description="Scrape Glassdoor reviews")
    parser.add_argument("--company", help="Scrape a specific company")
    parser.add_argument("--max-reviews", type=int, default=5,
                        help="Max reviews per company (default: 5)")
    args = parser.parse_args()

    if args.company:
        companies = [args.company]
    else:
        companies = load_companies_from_csv()
        if not companies:
            print("No companies found. Add some to companies_applied.csv first.")
            return

    print(f"Scraping {len(companies)} companies...")
    if not SCRAPER_API_KEY:
        log.warning("No SCRAPER_API_KEY set; requests will go direct (expect blocks)")

    session = get_session()
    results = []

    for i, company in enumerate(companies):
        print(f"[{i+1}/{len(companies)}] {company}")
        reviews_url = find_company_page(session, company)
        if reviews_url:
            data = scrape_company(session, company, reviews_url, args.max_reviews)
            if data:
                results.append(data)

        # Be polite. Glassdoor will ban you faster than a recruiter ghosts you
        if i < len(companies) - 1:
            time.sleep(2)

    output = {
        "scraped": str(date.today()),
        "companies": results
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\\nSaved {len(results)} companies to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
`),
    "pyproject.toml": file("pyproject.toml", `[project]
name = "job-search-tools"
version = "2.1.0"
description = "Automated job search & company research scripts"
requires-python = ">=3.11"
dependencies = [
    "selenium>=4.15",
    "beautifulsoup4>=4.12",
    "requests>=2.31",
    "fake-useragent>=1.4",
]

[project.optional-dependencies]
dev = ["ruff", "pytest", "ipython"]

[project.scripts]
auto-apply = "auto_apply:main"
scrape = "scrape_glassdoor:main"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I"]
ignore = ["E501"]  # I know, I know
`),
    ".gitignore": file(".gitignore", `# Python
__pycache__/
*.py[cod]
*.egg-info/
dist/
build/
.eggs/

# Scraped data: kept local only, not checked in.
# This stuff is borderline ToS-violating as-is,
# no need to put it on GitHub too.
data/

# Environment
.env
.venv/
venv/

# Selenium debugging screenshots
screenshots/

# IDE
.vscode/
.idea/

# OS
.DS_Store
`),
    ".env": file(".env", `# Job search automation credentials
# throwaway email for scraping accounts
SCRAPER_EMAIL=ren.jobhunt@proton.me
SCRAPER_PASSWORD=hunter2isnotmypassword

# ScraperAPI: free tier, 5000 req/mo
SCRAPER_API_KEY=sk_live_9f3a...redacted

# Set to 1 to preview without submitting applications
DRY_RUN=0
`),
    ".env.example": file(".env.example", `# Copy to .env and fill in your values
SCRAPER_EMAIL=your_throwaway@example.com
SCRAPER_PASSWORD=your_password_here
SCRAPER_API_KEY=sk_live_your_key_here

# Set to 0 to actually submit applications (careful!)
DRY_RUN=1
`),
    "README.md": file("README.md", `# job-search-tools

Ethically questionable, emotionally necessary.

Automated job application + company research scripts for when
you've been laid off and applying manually to 50 jobs feels like
a part-time job in itself.

## What's in here

- **auto_apply.py:** Scrapes job boards, keyword-matches postings,
  and auto-fills applications.
- **scrape_glassdoor.py:** Pulls company ratings and reviews for
  anywhere I've applied. Has saved me from at least two crypto scams.

## Setup

\`\`\`
cp .env.example .env
# fill in your credentials
pip install -e .
\`\`\`

## Usage

\`\`\`
auto-apply --keywords "ML engineer,AI,machine learning"
auto-apply --status
auto-apply --dry-run
scrape --company "SomeCompany"
\`\`\`

## Is this okay?

Probably not. But neither is ghosting candidates after four rounds
of interviews, so here we are.
`),
    ".python-version": file(".python-version", `3.11.7
`),
    data: dir("data", {
      "glassdoor_reviews.json": file("glassdoor_reviews.json", `{
  "scraped": "2026-02-15",
  "companies": [
    {
      "name": "DataSynth Corp",
      "rating": 4.1,
      "review_count": 342,
      "reviews": [
        {
          "stars": 4,
          "title": "Solid engineering culture",
          "role": "Software Engineer",
          "text": "Good team, interesting problems. A bit slow-moving but stable."
        }
      ]
    },
    {
      "name": "Meridian AI",
      "rating": 3.8,
      "review_count": 127,
      "status": "No Response",
      "reviews": []
    },
    {
      "name": "NexaCorp",
      "rating": 2.6,
      "review_count": 3,
      "reviews": [
        {
          "stars": 5,
          "title": "Great company!",
          "role": "Current - Lead",
          "date": "7 days ago",
          "text": "Chip is game changing. Great culture, great mission, great company!"
        },
        {
          "stars": 1,
          "title": "What a mess",
          "role": "Former - IT",
          "date": "6 months ago",
          "text": "Management doesn't have a clue."
        },
        {
          "stars": 2,
          "title": "Exhausting",
          "role": "Former Employee, Account Management",
          "date": "3 months ago",
          "text": "Overstated expectations - constant mismanagement."
        }
      ]
    },
    {
      "name": "OpenLoop Systems",
      "rating": 4.0,
      "review_count": 89,
      "reviews": [
        {
          "stars": 4,
          "title": "Great place to grow",
          "role": "Software Engineer",
          "text": "Good mentorship, reasonable hours. Tech stack is a bit dated."
        },
        {
          "stars": 5,
          "title": "Love this company",
          "role": "Data Scientist",
          "text": "Collaborative team, interesting ML projects."
        }
      ]
    },
    {
      "name": "CortexLab",
      "rating": 3.9,
      "review_count": 56,
      "status": "Applied",
      "reviews": [
        {
          "stars": 4,
          "title": "Cutting edge research",
          "role": "Research Engineer",
          "text": "Publish-or-perish culture but the work is fascinating."
        }
      ]
    }
  ]
}
`),
      "companies_applied.csv": file("companies_applied.csv", `company,role,date_applied,source,status,notes
DataSynth Corp,ML Engineer,2026-01-10,LinkedIn,Rejected,"Too senior"... what??
Meridian AI,AI Research Engineer,2026-01-15,Indeed,No Response,
Bright Path Analytics,Data Scientist,2026-01-18,LinkedIn,Rejected,
Quantum Mesh,ML Platform Engineer,2026-01-20,Company Site,No Response,
Synthetica Labs,AI Engineer,2026-01-22,Indeed,Rejected,Want PhD; MALWARE in take-home!! Reported to Indeed.
Novus Data,ML Engineer,2026-01-25,LinkedIn,No Response,
Arclight Ventures,Data Engineer,2026-01-26,LinkedIn,No Response,Wait - isn't this a VC firm?
Helix Robotics,Perception Engineer,2026-01-28,Indeed,Rejected,Not enough robotics exp
CoreML Systems,Senior ML Engineer,2026-02-01,LinkedIn,No Response,
NexaCorp,AI Engineer,2026-02-17,Indeed,Interview Complete,Small company. Edward seems nice but not technical. Easy interview
Atlas Digital,AI/ML Engineer,2026-02-05,LinkedIn,No Response,
Terraform Solutions,Data Scientist,2026-02-05,Indeed,Rejected,
Pinnacle AI,ML Infrastructure,2026-02-06,Company Site,No Response,
Blue Horizon Tech,ML Engineer,2026-02-07,LinkedIn,No Response,
CortexLab,Research Engineer,2026-02-10,Company Site,Applied,Long shot
`),
    }),
  });
}
