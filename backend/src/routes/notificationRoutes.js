import express from "express";
const router = express.Router();
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "../controllers/notificationController.js";
import verifyAuth from "../middleware/verifyAuth.js";
import attachUser from "../middleware/attachUser.js";

router.get("/", verifyAuth, attachUser, getMyNotifications);
router.get("/unread-count", verifyAuth, attachUser, getUnreadCount);
router.patch("/read-all", verifyAuth, attachUser, markAllAsRead);
router.patch("/:notificationId/read", verifyAuth, attachUser, markAsRead);

export default router;
