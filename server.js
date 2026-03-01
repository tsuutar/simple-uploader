require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploadfiles";

// .envからCORS許可オリジンを読み込み（カンマ区切り）
const customOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : [];

// アップロードディレクトリがなければ作成
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ローカルネットワークと.envで指定されたオリジンからのアクセスを許可
app.use(
  cors({
    origin: (origin, callback) => {
      // オリジンがない場合（同一オリジン）は許可
      if (!origin) {
        return callback(null, true);
      }

      // .envで指定されたオリジンをチェック
      if (customOrigins.length > 0 && customOrigins.includes(origin)) {
        return callback(null, true);
      }

      // ローカルホスト、プライベートIPアドレスからのアクセスを許可
      const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
      const privateIPPattern =
        /^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

      if (localhostPattern.test(origin) || privateIPPattern.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORSポリシーによりブロックされました"));
      }
    },
  }),
);

// ファイル名のサニタイズ
const sanitizeFilename = (filename) => {
  return path
    .basename(filename)
    .normalize("NFC") // Mac のエンコーディング問題を回避
    .replace(/[\/\\:*?"<>|]/g, "") // Windows の禁止文字を除去
    .replace(/\s+/g, "_"); // 空白をアンダースコアに変換
};

// multer設定
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Latin1 (ISO-8859-1) から UTF-8 に変換
    const safeFilename = sanitizeFilename(
      Buffer.from(file.originalname, "latin1").toString("utf-8"),
    );
    cb(null, safeFilename);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    cb(null, true);
  },
});

// 静的ファイルの提供
app.use(express.static("public"));
app.use("/uploads", express.static(UPLOAD_DIR));

// ファイルアップロードAPI
app.post("/upload", upload.array("files"), (req, res) => {
  res.json({ message: "ファイルがアップロードされました" });
});

// ファイル一覧取得API
app.get("/files", (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: "ファイルの取得に失敗しました" });
    }
    const fileList = files.map((file) => {
      const filePath = path.join(UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      return {
        name: encodeURIComponent(file), // 文字化けを防ぐ
        displayName: file,
        date: stats.birthtime,
        url: `/uploads/${encodeURIComponent(file)}`,
      };
    });
    res.setHeader(
      "Content-Disposition",
      "inline; filename*=UTF-8''" + encodeURIComponent("filelist.json"),
    );
    res.json(fileList);
  });
});

// ファイル削除API
app.delete("/delete/:filename", (req, res) => {
  try {
    const filename = sanitizeFilename(req.params.filename);
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ message: "ファイルが削除されました" });
    } else {
      res.status(404).json({ error: "ファイルが見つかりません" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "削除処理中にエラーが発生しました" });
  }
});

// エラーハンドリングミドルウェア
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(400).json({ error: err.message });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
