/**
 * What is switched on at the wedding.
 *
 * One flag, read in two places — the hub card and the router — so turning the
 * camera on is a one-line change rather than a hunt.
 */

/**
 * "The Wedding Through Your Eyes".
 *
 * ON for Phase 2.
 *
 * ── THE ORDER MATTERS ──────────────────────────────────────────────────────
 * This branch must not reach Production before
 * supabase/migrations/0008_guest_photos.sql has been applied. With the flag
 * on and the bucket absent, a guest takes a photograph, taps Send, and is
 * told it failed — which is worse than never being offered the camera at all.
 *
 *   1. apply 0008 in the Supabase SQL editor
 *   2. confirm the bucket exists and is private
 *   3. then merge and deploy
 *
 * While this is false:
 *   • the hub still shows the card, so the concept reads whole, but it is
 *     plain text rather than a link — nothing to tap and no dead end;
 *   • /wedding/camera redirects to the hub, so the camera cannot be reached
 *     by typing the URL either.
 *
 * Flipping this back to false is the kill switch if anything goes wrong on
 * the day: one line, one deploy, and the card returns to Coming Soon without
 * touching the bucket or a single stored photograph.
 */
export const CAMERA_ENABLED = true;
