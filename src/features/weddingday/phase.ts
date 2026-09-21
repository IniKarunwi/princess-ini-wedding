/**
 * What is switched on at the wedding.
 *
 * One flag, read in two places — the hub card and the router — so turning the
 * camera on is a one-line change rather than a hunt.
 */

/**
 * "The Wedding Through Your Eyes".
 *
 * OFF for Phase 1. The capture flow is built and tested, but photographs have
 * nowhere to go until supabase/migrations/0008_guest_photos.sql is applied,
 * and a guest who takes ten photographs and is then told they cannot be sent
 * has had a worse experience than one who was never offered the camera.
 *
 * While this is false:
 *   • the hub still shows the card, so the concept reads whole, but it is
 *     plain text rather than a link — nothing to tap and no dead end;
 *   • /wedding/camera redirects to the hub, so the unfinished camera cannot
 *     be reached by typing the URL either.
 *
 * Phase 2: apply 0008, flip this to true. Nothing else changes.
 */
export const CAMERA_ENABLED = false;
