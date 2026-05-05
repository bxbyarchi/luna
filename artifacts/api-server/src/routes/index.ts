import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import categoriesRouter from "./categories";
import itemsRouter from "./items";
import receiptsRouter from "./receipts";
import writeOffsRouter from "./writeOffs";
import inventoryAuditsRouter from "./inventoryAudits";
import staffRouter from "./staff";
import analyticsRouter from "./analytics";
import auditLogRouter from "./auditLog";
import exportRouter from "./exportRoutes";
import storageRouter from "./storage";
import rentalsRouter from "./rentals";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(categoriesRouter);
router.use(itemsRouter);
router.use(receiptsRouter);
router.use(writeOffsRouter);
router.use(inventoryAuditsRouter);
router.use(staffRouter);
router.use(analyticsRouter);
router.use(auditLogRouter);
router.use(exportRouter);
router.use(storageRouter);
router.use(rentalsRouter);

export default router;
