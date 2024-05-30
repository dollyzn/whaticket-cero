import qrCode from "qrcode-terminal";
import { Client, LocalAuth } from "whatsapp-web.js";
import { getIO } from "./socket";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import { handleMessage } from "../services/WbotServices/wbotMessageListener";

interface Session extends Client {
  id?: number;
}

const sessions: Session[] = [];

const syncUnreadMessages = async (wbot: Session) => {
  const chats = await wbot.getChats();

  /* eslint-disable no-restricted-syntax */
  /* eslint-disable no-await-in-loop */
  for (const chat of chats) {
    if (chat.unreadCount > 0) {
      const unreadMessages = await chat.fetchMessages({
        limit: chat.unreadCount
      });

      for (const msg of unreadMessages) {
        await handleMessage(msg, wbot);
      }

      await chat.sendSeen();
    }
  }
};

export const initWbot = async (whatsapp: Whatsapp): Promise<Session> => {
  return new Promise((resolve, reject) => {
    try {
      const io = getIO();
      const sessionName = whatsapp.name;
      const requestPairingCode = whatsapp.requestCode;
      const targetPhoneNumber = whatsapp.number;
      let sessionCfg;

      if (whatsapp && whatsapp.session) {
        sessionCfg = JSON.parse(whatsapp.session);
      }

      const args: String = process.env.CHROME_ARGS || "";

      const wbot: Session = new Client({
        webVersion: "2.2412.54",
        webVersionCache: {
          type: "remote",
          remotePath:
            "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html"
        },
        session: sessionCfg,
        authStrategy: new LocalAuth({ clientId: "bd_" + whatsapp.id }),
        puppeteer: {
          executablePath: process.env.CHROME_BIN || undefined,
          // @ts-ignore
          browserWSEndpoint: process.env.CHROME_WS || undefined,
          args: args.split(" ")
        }
      });

      wbot.initialize().catch(_ => _);

      let pairingCodeRequested = false;
      wbot.on("qr", async qr => {
        logger.info(`Session: ${sessionName}`);
        qrCode.generate(qr, { small: true });
        await whatsapp.update({ qrcode: qr, status: "qrcode", retries: 0 });

        if (requestPairingCode && !pairingCodeRequested) {
          const pairingCode = await wbot.requestPairingCode(targetPhoneNumber);
          await whatsapp.update({
            pairingCode: pairingCode,
            status: "qrcode",
            retries: 0
          });
          logger.info(
            `Pairing code enabled. Session: ${sessionName} Code: ${pairingCode}`
          );
          pairingCodeRequested = true;
        }

        const sessionIndex = sessions.findIndex(s => s.id === whatsapp.id);
        if (sessionIndex === -1) {
          wbot.id = whatsapp.id;
          sessions.push(wbot);
        }

        io.emit("whatsappSession", {
          action: "update",
          session: whatsapp
        });
      });

      wbot.on("loading_screen", async (percent, message) => {
        logger.info(`LOADING: Session: ${sessionName}, ${percent}, ${message}`);

        await whatsapp.update({
          status: "OPENING",
          qrcode: "",
          pairingCode: "",
          retries: 0
        });

        io.emit("whatsappSession", {
          action: "update",
          session: whatsapp
        });
      });

      wbot.on("disconnected", async reason => {
        logger.info(`DISCONECTED: Session: ${sessionName} Reason: ${reason}`);
      });

      wbot.on("authenticated", async session => {
        pairingCodeRequested = false;

        logger.info(`Session: ${sessionName} AUTHENTICATED`);
      });

      wbot.on("auth_failure", async msg => {
        pairingCodeRequested = false;

        console.error(
          `Session: ${sessionName} AUTHENTICATION FAILURE! Reason: ${msg}`
        );

        if (whatsapp.retries > 1) {
          await whatsapp.update({ session: "", retries: 0 });
        }

        const retry = whatsapp.retries;
        await whatsapp.update({
          status: "DISCONNECTED",
          retries: retry + 1
        });

        io.emit("whatsappSession", {
          action: "update",
          session: whatsapp
        });

        reject(new Error("Error starting whatsapp session."));
      });

      wbot.on("ready", async () => {
        pairingCodeRequested = false;

        logger.info(`Session: ${sessionName} READY`);

        await whatsapp.update({
          status: "CONNECTED",
          qrcode: "",
          pairingCode: "",
          retries: 0
        });

        io.emit("whatsappSession", {
          action: "update",
          session: whatsapp
        });

        const sessionIndex = sessions.findIndex(s => s.id === whatsapp.id);
        if (sessionIndex === -1) {
          wbot.id = whatsapp.id;
          sessions.push(wbot);
        }

        wbot.sendPresenceAvailable();
        await syncUnreadMessages(wbot);

        resolve(wbot);
      });
    } catch (err) {
      let errorMessage = "Failed to do something exceptional";
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      logger.error(errorMessage);
    }
  });
};

export const requestPairCode = async (whatsapp: Whatsapp): Promise<void> => {
  const sessionIndex = sessions.findIndex(s => s.id === whatsapp.id);

  if (sessionIndex !== -1) {
    const pairingCode = await sessions[sessionIndex].requestPairingCode(
      whatsapp.number
    );
    await whatsapp.update({
      number: whatsapp.number,
      pairingCode: pairingCode,
      status: "qrcode",
      retries: 0
    });

    logger.info(
      `Request Pairing Code. Session: ${whatsapp.name} Code: ${pairingCode}`
    );
  } else {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
};

export const getWbot = (whatsappId: number): Session => {
  const sessionIndex = sessions.findIndex(s => s.id === whatsappId);

  if (sessionIndex === -1) {
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
  return sessions[sessionIndex];
};

export const removeWbot = async (
  whatsappId: number,
  destroy?: boolean
): Promise<void> => {
  try {
    const sessionIndex = sessions.findIndex(s => s.id === whatsappId);
    if (sessionIndex !== -1) {
      if (destroy) {
        await sessions[sessionIndex].destroy();
      } else {
        await sessions[sessionIndex].logout();
        await sessions[sessionIndex].initialize();

        const whatsapp = await Whatsapp.findByPk(whatsappId);
        if (whatsapp?.requestCode && !!whatsapp?.number) {
          await requestPairCode(whatsapp);
        } else if (whatsapp) {
          await whatsapp.update({ pairingCode: "" });
        }
      }
      sessions.splice(sessionIndex, 1);
    }
  } catch (err) {
    let errorMessage = "Failed to do something exceptional";
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    logger.error(errorMessage);
  }
};
