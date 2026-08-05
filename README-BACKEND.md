# Victory Consulting — Backend Notes

## Structure
- Static HTML site is the **SEO source of truth** (meta, JSON-LD, copy all live in the .html files).
- `styles.css` + `motion.js` are the Studio Seven build-system design/motion layer, shared by every page.
- `data/*.json` is the backend-ready data layer. It **mirrors** the HTML blocks wrapped in marker comments:
  - `data/team.json` ↔ `<!-- data:team -->…<!-- /data:team -->` (meet-victory.html, 21 members)
  - `data/testimonials.json` ↔ `<!-- data:testimonials -->…<!-- /data:testimonials -->` (index.html, the-elephant.html, leadership-development.html, team-effectiveness.html, presentation-impact.html)
  - `data/posts.json` ↔ `<!-- data:posts -->…<!-- /data:posts -->` (blog.html listing)

## Future admin app (app.victoryconsulting.com)
The admin app manages content by:
1. Editing the JSON files in `data/` (add/edit/remove team members, testimonials, posts).
2. Regenerating the corresponding marked HTML blocks in place — everything outside the
   `<!-- data:* -->` markers must be left byte-for-byte untouched.
3. For a new blog post: append an entry to `data/posts.json`, generate a new
   `blog-<slug>.html` file from the article template (copy blog-4-ways-to-make-conflict-productive.html:
   head meta + Article/BreadcrumbList JSON-LD + `.article` body), and regenerate the
   `data:posts` block in blog.html. Add the new URL to sitemap.xml.
4. Deploying the static output.

## Deploy
- Studio Seven preview target: **victory.studio7.select**
- Production: www.victoryconsulting.com

## Conventions
- Slugs are kebab-case and stable (used for file names and future deep links).
- Dates are ISO `YYYY-MM-DD` in JSON; display format lives in the HTML templates.
- Photos are remote URLs today; the admin app may later mirror them to local assets.
