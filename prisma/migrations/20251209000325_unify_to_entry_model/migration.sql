/*
  Warnings:

  - You are about to drop the column `memo` on the `entries` table. All the data in the column will be lost.
  - You are about to drop the column `occurred_on` on the `entries` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `entries` table. All the data in the column will be lost.
  - You are about to drop the `users` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `event_name` to the `entries` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "entries" DROP CONSTRAINT "entries_user_id_fkey";

-- DropIndex
DROP INDEX "entries_user_id_occurred_on_idx";

-- AlterTable
ALTER TABLE "entries" DROP COLUMN "memo",
DROP COLUMN "occurred_on",
DROP COLUMN "title",
ADD COLUMN     "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "event_name" TEXT NOT NULL,
ADD COLUMN     "note" TEXT NOT NULL DEFAULT '';

-- DropTable
DROP TABLE "users";

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "entries_user_id_date_idx" ON "entries"("user_id", "date" DESC);

-- AddForeignKey
ALTER TABLE "entries" ADD CONSTRAINT "entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
