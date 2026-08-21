import express from "express";
const router = express.Router();
import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "../controllers/notificationController.js";
import verifyPrivyToken from "../middleware/auth.js";
import attachUser from "../middleware/attachUser.js";

router.get("/", verifyPrivyToken, attachUser, getMyNotifications);
router.get("/unread-count", verifyPrivyToken, attachUser, getUnreadCount);
router.patch("/read-all", verifyPrivyToken, attachUser, markAllAsRead);
router.patch("/:notificationId/read", verifyPrivyToken, attachUser, markAsRead);

export default router;
