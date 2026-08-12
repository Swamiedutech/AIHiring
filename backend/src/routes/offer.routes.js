const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");
const roleMiddleware = require("../middleware/role.middleware");

const {
  createOffer,
  respondOffer,
  getOfferDetails,
  getDispatchedOffers
} = require("../controllers/offer.controller");

const templateController = require("../controllers/offerTemplate.controller");

/* Template Management */
router.get(
  "/templates",
  authMiddleware,
  roleMiddleware(["HR", "ADMIN"]),
  templateController.getTemplates
);

router.post(
  "/templates",
  authMiddleware,
  roleMiddleware(["HR", "ADMIN"]),
  templateController.createTemplate
);

router.put(
  "/templates/:id",
  authMiddleware,
  roleMiddleware(["HR", "ADMIN"]),
  templateController.updateTemplate
);

/* HR/Admin creates offer */
router.post(
  "/create",
  authMiddleware,
  roleMiddleware(["HR", "ADMIN"]),
  createOffer
);

/* Candidate sees offer details */
router.get(
  "/application/:applicationId",
  authMiddleware,
  roleMiddleware(["CANDIDATE"]),
  getOfferDetails
);

/* Candidate responds to offer */
router.post(
  "/respond-to-offer",
  authMiddleware,
  roleMiddleware(["CANDIDATE"]),
  respondOffer
);

/* Get all dispatched offers */
router.get(
  "/dispatched",
  authMiddleware,
  roleMiddleware(["HR", "ADMIN"]),
  getDispatchedOffers
);

module.exports = router;
