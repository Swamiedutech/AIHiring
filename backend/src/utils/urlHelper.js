/**
 * URL Helper — centralizes the backend base URL so it's never hardcoded.
 * 
 * Usage:
 *   const { getBackendUrl, buildAssetUrl } = require('../utils/urlHelper');
 *   const imgUrl = buildAssetUrl(candidate.profile_image_path);
 */

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/+$/, '');

/**
 * Returns the backend base URL (no trailing slash).
 */
function getBackendUrl() {
  return BACKEND_URL;
}

/**
 * Builds a full asset URL from a relative path.
 * Handles missing leading slashes and null/undefined paths.
 * 
 * @param {string|null|undefined} relativePath - e.g. "/uploads/photo.jpg"
 * @param {string} [fallback] - optional fallback if path is falsy
 * @returns {string|null}
 */
function buildAssetUrl(relativePath, fallback = null) {
  if (!relativePath) return fallback;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
  const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${BACKEND_URL}${cleanPath}`;
}

module.exports = { getBackendUrl, buildAssetUrl };
