-- The automated WhatsApp sender was removed; its session table goes with it.
-- IF EXISTS: safe whether or not the previous migration was ever deployed.
-- DropTable
DROP TABLE IF EXISTS "WhatsappAuth";
