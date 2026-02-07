# Brawlers Tavern - Stats & Leaderboards

A comprehensive statistics website for Brawlers Tavern game with external data loading for easy updates.

## 🎯 Features

- **All Brawlers** - Grid view with search functionality
- **Solo Brawl Leaderboard** - Ranked by rating (25+ brawls required)
- **Team Brawl Leaderboard** - Team rankings (25+ brawls required)
- **CTF Champions** - Complete CTF analysis with normalized scores (0-10 scale)
  - Overall Score
  - Offensive Score  
  - Defensive Score
  - Win Rate Leaderboard
  - Full Stats Breakdown
- **Combat Analysis** - Filterable by traits and fighting styles with Brawl Score (0-10)
- **Guild Rankings** - Guilds ranked by total member reputation

## 📁 File Structure

```
/
├── index.html          # Main HTML file (9KB)
├── styles.css          # All styling (16KB)
├── app.js              # Core JavaScript (26KB - needs rendering functions)
├── rendering.js        # Rendering functions (create this from template below)
└── data/               # External data files (updateable)
    ├── users.json      # Player data
    ├── guilds.json     # Guild data with members
    ├── ctf_stats.json  # CTF normalization statistics
    └── brawl_stats.json # Brawl normalization statistics
```

## 🚀 Setup

### Option 1: Local Development

1. **Place all files in a directory**:
   ```
   your-website/
   ├── index.html
   ├── styles.css
   ├── app.js
   ├── rendering.js  (you'll need to create this)
   └── data/
       ├── users.json
       ├── guilds.json
       ├── ctf_stats.json
       └── brawl_stats.json
   ```

2. **Serve with a local web server** (required for fetch() to work):
   ```bash
   # Python 3
   python3 -m http.server 8000
   
   # Python 2
   python -m SimpleHTTPServer 8000
   
   # Node.js (with http-server)
   npx http-server
   ```

3. **Open in browser**: `http://localhost:8000`

### Option 2: Web Server Deployment

1. Upload all files to your web server
2. Ensure the `data/` directory is accessible
3. Access via your domain

## 🔄 Updating Data

To update the statistics, simply replace the JSON files in the `data/` directory:

### From Firebase Export

If you have Firebase export files:

```python
import json

# Read Firebase export
with open('users-export.json') as f:
    export = json.load(f)
    
users_data = export.get('data', {})

# Process and save
# (Use the processing script provided separately)
```

### Manual Update

1. Replace files in `data/` directory:
   - `users.json` - Updated player statistics
   - `guilds.json` - Updated guild information
   - `ctf_stats.json` - Recalculated CTF normalization stats
   - `brawl_stats.json` - Recalculated brawl normalization stats

2. Refresh the webpage - changes appear immediately!

## 📊 Data Processing

Use the provided Python script to process Firebase exports:

```python
python process_data.py users-export.json guilds-export.json
```

This will generate all files in the `data/` directory.

## 🎨 Customization

### Colors

Edit `styles.css` and modify CSS variables:

```css
:root {
    --bg-dark: #1a1410;
    --accent-gold: #d4af37;
    --accent-red: #8b0000;
    /* ... modify as needed */
}
```

### Features

To add/remove sections, edit:
1. Navigation in `index.html`
2. Section HTML in `index.html`
3. Rendering function in `app.js` / `rendering.js`

## 🔧 Technical Details

### Player Head Rendering

Player avatars are composed of layered images from CDN:
- Base: head, eyes (eyelids), eyebrows, markings
- Middle: facial hair, eyes, mask
- Top: hair, ears, hat

Images use:
- `object-fit: contain` - Prevents scaling distortion
- `image-rendering: pixelated` - Maintains pixel art quality

### Color Tinting

- White color (4294967295) skips tinting
- Eyes use reversed tint colors (tintDarkColor becomes main)
- Dual-tone tinting for realistic shading

### Normalized Scores

All scores use min-max normalization:
```javascript
normalize(value, min, max) = ((value - min) / (max - min)) × 10
```

**CTF Overall Score**:
```
Overall = 50% Win Rate (normalized) + 50% MAX(Offensive, Defensive)
```

**CTF Offensive Score**:
```
Offensive = (Captures/g + Charges/g + Escorts/g) / 3
```

**CTF Defensive Score**:
```
Defensive = (Defenses/g + Recovers/g) / 2
```

**Brawl Score**:
```
BrawlScore = (Rating × 0.7) + (WinRate × 0.3)
```

## 🐛 Troubleshooting

### "Error loading data"
- Ensure you're running a local web server (not file://)
- Check that `data/` directory exists and contains JSON files
- Check browser console for specific errors

### Images not loading
- Verify CDN is accessible: `https://cdn.brawlerstavern.com`
- Check player outfit data has valid skinName values

### Modals not closing
- Click outside the modal content area
- Use the × button in top-right corner

## 📱 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## 🎯 Future Enhancements

Consider adding:
- Player comparison tool
- Historical data tracking
- Achievement system display
- More event types (Brawl Ball, Foot Brawl)
- Export/share player profiles

## 📝 License

Copyright © 2026 Brawlers Tavern. All rights reserved.

## 🙋 Support

For issues or questions about the website, contact your Brawlers Tavern administrator.

---

**Note**: The `rendering.js` file needs to be created with all rendering functions. See `RENDERING_FUNCTIONS_TEMPLATE.md` for the complete code.
