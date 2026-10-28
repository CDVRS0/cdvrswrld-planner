# CEED character identity

The existing CEED character in `public/ceed-assistant.webp` is the primary mark, replacing the provisional orb. Use `src/ceed/CeedLogo.jsx` for the visual mark and `CeedBrand` for a keyboard-accessible assistant trigger.

The mark uses its original alpha as a CSS mask, with colour supplied by `--ceed-text`, `--ceed-accent` and `--ceed-glow`. Import the shared `components/ceed/ceed.css` tokens and logo rules. Do not hard-code purple for future themes. Idle motion is brief and occasional; respect reduced motion. The sidebar trigger belongs top-left; use the compact trigger in the mobile header. Avoid a duplicate floating mascot over app content.

Clicking the mark opens the existing authenticated assistant and makes no model request until the user sends a message. Preserve the conversation and return focus to the trigger when closing. Keep a visible Home navigation option after replacing the previous home-link logo.

For future CEED apps, reuse this mark, component and theme contract. Existing apps in other repositories still require their own integration and verification; this document does not deploy or modify those apps.

Login and loading states use the same mark; the login mark remains decorative until authentication. The browser tab uses the original character asset as a static icon.
