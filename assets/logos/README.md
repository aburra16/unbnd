# Unbnd — Web Asset Package

## Files

| File | Purpose | Size |
|------|---------|------|
| `favicon.ico` | Browser tab icon (16/32/48px multi-size) | multi |
| `favicon-16x16.png` | Standard small favicon | 16×16 |
| `favicon-32x32.png` | Standard favicon | 32×32 |
| `favicon-48x48.png` | Larger favicon | 48×48 |
| `apple-touch-icon.png` | iOS home screen icon | 180×180 |
| `android-chrome-192x192.png` | Android home screen icon | 192×192 |
| `android-chrome-512x512.png` | Android splash / PWA icon | 512×512 |
| `logo-full-500.png` | Full logo with wordmark (mark + "unbnd" + tagline) | 500×500 |
| `og-image-1200.png` | Open Graph / social share image | 1200×1200 |
| `site.webmanifest` | PWA manifest | — |

## Canva source

The editable logo is in your Canva account:
- **Edit**: https://www.canva.com/d/jDV0_aHfetuGwWW
- **View**: https://www.canva.com/d/dPlXOznv-6B5XEe

## HTML `<head>` snippet

```html
<!-- Unbnd favicons -->
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#1A1A2E">

<!-- Open Graph -->
<meta property="og:image" content="https://unbnd.ink/og-image-1200.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="1200">
<meta property="og:title" content="Unbnd — Books unbound">
<meta property="og:description" content="Discover books through people you trust, not algorithms.">

<!-- Twitter -->
<meta name="twitter:card" content="summary">
<meta name="twitter:image" content="https://unbnd.ink/og-image-1200.png">
```

## Brand colors (CSS custom properties)

```css
:root {
  --unbnd-ink: #1A1A2E;
  --unbnd-amber: #C4763C;
  --unbnd-parchment: #FAF6F0;
  --unbnd-muted: #8B8698;
  --unbnd-night: #0E0E1A;
  --unbnd-amber-light: #E8A96A;
}
```
