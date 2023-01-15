import { join } from "path";
import { promisify } from "util";
import { writeFile } from "fs";
import { Op } from "sequelize";
import * as Sentry from "@sentry/node";

import {
  Contact as WbotContact,
  Message as WbotMessage,
  Call as WbotCall,
  MessageMedia,
  MessageAck,
  Client,
  Buttons,
  Chat
} from "whatsapp-web.js";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";

import { getIO } from "../../libs/socket";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { logger } from "../../utils/logger";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import { debounce } from "../../helpers/Debounce";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import CreateContactService from "../ContactServices/CreateContactService";
import formatBody from "../../helpers/Mustache";
import { queryDialogFlow } from "../DialogflowServices/QueryDialogflow";
import { createDialogflowSessionWithModel } from "../DialogflowServices/CreateSessionDialogflow";
import ListSettingsServiceOne from "../SettingServices/ListSettingsServiceOne";
import ToggleUseDialogflowService from "../ContactServices/ToggleUseDialogflowContactService";

interface Session extends Client {
  id?: number;
}

const writeFileAsync = promisify(writeFile);

const verifyContact = async (msgContact: WbotContact): Promise<Contact> => {
  const profilePicUrl = await msgContact.getProfilePicUrl();

  const contactData = {
    name: msgContact.name || msgContact.pushname || msgContact.id.user,
    number: msgContact.id.user,
    profilePicUrl,
    isGroup: msgContact.isGroup
  };

  const contact = CreateOrUpdateContactService(contactData);

  return contact;
};

const verifyQuotedMessage = async (
  msg: WbotMessage
): Promise<Message | null> => {
  if (!msg.hasQuotedMsg) return null;

  const wbotQuotedMsg = await msg.getQuotedMessage();

  const quotedMsg = await Message.findOne({
    where: { id: wbotQuotedMsg.id.id }
  });

  if (!quotedMsg) return null;

  return quotedMsg;
};

const verifyMediaMessage = async (
  msg: WbotMessage,
  ticket: Ticket,
  contact: Contact
): Promise<Message> => {
  const quotedMsg = await verifyQuotedMessage(msg);

  const media = await msg.downloadMedia();

  if (!media) {
    throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
  }

  if (!media.filename) {
    const ext = media.mimetype.split("/")[1].split(";")[0];
    media.filename = `${new Date().getTime()}.${ext}`;
  }

  try {
    await writeFileAsync(
      join(__dirname, "..", "..", "..", "public", media.filename),
      media.data,
      "base64"
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(err!);
  }

  const messageData = {
    id: msg.id.id,
    ticketId: ticket.id,
    contactId: msg.fromMe ? undefined : contact.id,
    body: msg.body,
    fromMe: msg.fromMe,
    read: msg.fromMe,
    mediaUrl: media.filename,
    mediaType: media.mimetype.split("/")[0],
    quotedMsgId: quotedMsg?.id
  };

  if (msg.type === "audio" || msg.type === "ptt") {
    msg.body = "🎤 Áudio";
  }

  if (msg.type === "video") {
    if (msg.body) {
      msg.body = `🎥 ${msg.body}`;
    } else {
      msg.body = "🎥 Vídeo";
    }
  }

  if (msg.type === "image") {
    if (msg.body) {
      msg.body = `📷 ${msg.body}`;
    } else {
      msg.body = "📷 Foto";
    }
  }

  if (msg.type === "document") {
    msg.body = `📄 ${msg.body}`;
  }

  if (msg.type === "sticker") {
    msg.body = "💌 Figurinha";
  }

  await ticket.update({
    lastMessage: msg.body || "Arquivo de mídia desconhecido"
  });
  const newMessage = await CreateMessageService({ messageData });

  return newMessage;
};

const verifyMessage = async (
  msg: WbotMessage,
  ticket: Ticket,
  contact: Contact
) => {
  if (msg.type === "location") msg = prepareLocation(msg);

  const quotedMsg = await verifyQuotedMessage(msg);
  const messageData = {
    id: msg.id.id,
    ticketId: ticket.id,
    contactId: msg.fromMe ? undefined : contact.id,
    body: msg.body,
    fromMe: msg.fromMe,
    mediaType: msg.type,
    read: msg.fromMe,
    quotedMsgId: quotedMsg?.id
  };

  await ticket.update({
    lastMessage:
      msg.type === "location"
        ? msg.location.description
          ? "Localization - " + msg.location.description.split("\\n")[0]
          : "Localization"
        : msg.body
  });

  await CreateMessageService({ messageData });
};

const prepareLocation = (msg: WbotMessage): WbotMessage => {
  let gmapsUrl =
    "https://maps.google.com/maps?q=" +
    msg.location.latitude +
    "%2C" +
    msg.location.longitude +
    "&z=17&hl=pt-BR";

  msg.body = "data:image/png;base64," + msg.body + "|" + gmapsUrl;

  msg.body +=
    "|" +
    (msg.location.description
      ? msg.location.description
      : msg.location.latitude + ", " + msg.location.longitude);

  return msg;
};

const verifyQueue = async (
  wbot: Session,
  msg: WbotMessage,
  ticket: Ticket,
  contact: Contact
) => {
  const {
    queues,
    greetingMessage,
    useoutServiceMessage,
    outServiceMessage,
    openingHours,
    closingHours
  } = await ShowWhatsAppService(wbot.id!);

  const Hr = new Date();
  const hh: number = Hr.getHours() * 24 * 60;
  const mm: number = Hr.getMinutes() * 24;
  const ss: number = Hr.getSeconds();
  const hora = hh + mm + ss;

  const inicio = openingHours;
  const hhinicio = Number(inicio.split(":")[0]) * 24 * 60;
  const mminicio = Number(inicio.split(":")[1]) * 24;
  const ssinicio = Number(inicio.split(":")[2]);
  const horainicio = hhinicio + mminicio + ssinicio;

  const terminio = closingHours;
  const hhterminio = Number(terminio.split(":")[0]) * 24 * 60;
  const mmterminio = Number(terminio.split(":")[1]) * 24;
  const ssterminio = Number(terminio.split(":")[2]);
  const horaterminio = hhterminio + mmterminio + ssterminio;

  if (queues.length === 1) {
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id },
      ticketId: ticket.id
    });

    if (useoutServiceMessage && (hora < horainicio || hora > horaterminio)) {
      const body = formatBody(`\u200e${outServiceMessage}`, contact);

      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        body
      );

      await verifyMessage(sentMessage, ticket, contact);

      setTimeout(async () => {
        await UpdateTicketService({
          ticketId: ticket.id,
          ticketData: { status: "closed" }
        });
      }, 1000);
      return;
    }
    return;
  }

  if (!contact.useQueues) {
    return;
  }

  let selectedOption = msg.body;

  if (msg.body.toUpperCase() == "SOU PACIENTE") {
    selectedOption = "1";
  } else if (msg.body.toUpperCase() == "SOU DENTISTA") {
    selectedOption = "2";
  }

  const choosenQueue = queues[+selectedOption - 1];

  if (choosenQueue) {
    await UpdateTicketService({
      ticketData: { queueId: choosenQueue.id },
      ticketId: ticket.id
    });

    if (choosenQueue.greetingMessage) {
      if (useoutServiceMessage && (hora < horainicio || hora > horaterminio)) {
        const body = formatBody(`\u200e${outServiceMessage}`, contact);

        const sentMessage = await wbot.sendMessage(
          `${contact.number}@c.us`,
          body
        );

        await verifyMessage(sentMessage, ticket, contact);

        setTimeout(async () => {
          await UpdateTicketService({
            ticketId: ticket.id,
            ticketData: { status: "closed" }
          });
        }, 1000);
      } else {
        const body = formatBody(
          `\u200e${choosenQueue.greetingMessage}`,
          contact
        );

        if (choosenQueue === queues[0]) {
          try {
            let button = new Buttons(body, [
              { body: "Sim", id: "startAtendanceYes" },
              { body: "Não", id: "startAtendanceNo" }
            ]);

            const sentMessage = await wbot.sendMessage(
              `${contact.number}@c.us`,
              button
            );

            await verifyMessage(sentMessage, ticket, contact);
          } catch {
            const sentMessage = await wbot.sendMessage(
              `${contact.number}@c.us`,
              body
            );

            await verifyMessage(sentMessage, ticket, contact);
          }
        } else {
          const sentMessage = await wbot.sendMessage(
            `${contact.number}@c.us`,
            body
          );

          await verifyMessage(sentMessage, ticket, contact);
        }
      }
    }
  } else {
    let options = "";

    queues.forEach((queue, index) => {
      let queuename;

      if (queue.name.substring(0, 6) == "Fila 1") {
        queuename = "Sou PACIENTE";
      } else if (queue.name.substring(0, 6) == "Fila 2") {
        queuename = "Sou DENTISTA";
      } else if (queue.name.substring(0, 6) == "Fila 3") {
        queuename = "Comprovantes e Requisições";
      } else {
        queuename = "Nome indefinido (backend)";
      }

      options += `*${index + 1}* - ${queuename}\n`;
    });

    if (useoutServiceMessage && (hora < horainicio || hora > horaterminio)) {
      const body = formatBody(`\u200e${outServiceMessage}`, contact);

      const debouncedSentMessage = debounce(
        async () => {
          const sentMessage = await wbot.sendMessage(
            `${contact.number}@c.us`,
            body
          );
          verifyMessage(sentMessage, ticket, contact);
        },
        3000,
        ticket.id
      );

      debouncedSentMessage();

      setTimeout(async () => {
        await UpdateTicketService({
          ticketId: ticket.id,
          ticketData: { status: "closed" }
        });
      }, 1000);
    } else {
      const body = formatBody(`\u200e${greetingMessage}\n${options}`, contact);

      try {
        let button = new Buttons(
          greetingMessage,
          [{ body: "Sou Paciente" }, { body: "Sou Dentista" }],
          "Olá, seja bem-vindo!"
        );

        const debouncedSentMessage = debounce(
          async () => {
            const sentMessage = await wbot.sendMessage(
              `${contact.number}@c.us`,
              button
            );
            verifyMessage(sentMessage, ticket, contact);
          },
          3000,
          ticket.id
        );

        debouncedSentMessage();
      } catch {
        const debouncedSentMessage = debounce(
          async () => {
            const sentMessage = await wbot.sendMessage(
              `${contact.number}@c.us`,
              body
            );
            verifyMessage(sentMessage, ticket, contact);
          },
          3000,
          ticket.id
        );

        debouncedSentMessage();
      }
    }
  }
};

const sendDialogflowAwswer = async (
  wbot: Session,
  ticket: Ticket,
  msg: WbotMessage,
  contact: Contact,
  chat: Chat
) => {
  const session = await createDialogflowSessionWithModel(
    ticket.queue.dialogflow
  );
  if (session === undefined) {
    return;
  }

  wbot.sendPresenceAvailable();

  if (msg.type === "document") {
    msg.body = "image";
  }

  if (msg.selectedButtonId === "startAtendanceYes") {
    msg.body = "buttons_response_yes";
  }
  if (msg.selectedButtonId === "startAtendanceNo") {
    msg.body = "buttons_response_no";
  }

  let dialogFlowReply = await queryDialogFlow(
    session,
    ticket.queue.dialogflow.projectName,
    msg.from,
    msg.body,
    ticket.queue.dialogflow.language
  );
  if (dialogFlowReply === null) {
    return;
  }

  if (dialogFlowReply.endConversation) {
    await ToggleUseDialogflowService({
      contactId: ticket.contact.id.toString(),
      setUseDialogFlow: { useDialogflow: false }
    });
  }

  chat.sendStateTyping();

  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  await delay(3000);

  for (let message of dialogFlowReply.responses) {
    await sendDelayedMessages(
      wbot,
      ticket,
      contact,
      message.text.text[0],
      dialogFlowReply.button.button1 ? dialogFlowReply.button : undefined,
      dialogFlowReply.button.image
        ? dialogFlowReply.button.image.stringValue
        : undefined
    );
  }
};

async function sendDelayedMessages(
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  message: string,
  sendButtonMessage:
    | {
        button1: { stringValue: string };
        button2: { stringValue: string };
        button3: { stringValue: string };
      }
    | undefined,
  sendImage: string | undefined
) {
  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  if (sendButtonMessage) {
    if (
      sendButtonMessage.button1 &&
      sendButtonMessage.button2 &&
      sendButtonMessage.button3
    ) {
      let button = new Buttons(
        `*${ticket.queue.dialogflow.name}:* ${message}`,
        [
          { body: sendButtonMessage.button1.stringValue },
          { body: sendButtonMessage.button2.stringValue },
          { body: sendButtonMessage.button3.stringValue }
        ]
      );

      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        button
      );

      await verifyMessage(sentMessage, ticket, contact);
      await delay(5000);
    } else if (sendButtonMessage.button1 && sendButtonMessage.button2) {
      let button = new Buttons(
        `*${ticket.queue.dialogflow.name}:* ${message}`,
        [
          { body: sendButtonMessage.button1.stringValue },
          { body: sendButtonMessage.button2.stringValue }
        ]
      );

      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        button
      );

      await verifyMessage(sentMessage, ticket, contact);
      await delay(5000);
    } else {
      let button = new Buttons(
        `*${ticket.queue.dialogflow.name}:* ${message}`,
        [{ body: sendButtonMessage.button1.stringValue }]
      );

      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        button
      );

      await verifyMessage(sentMessage, ticket, contact);
      await delay(5000);
    }
  } else if (message === "Atendimento finalizado.") {
    await delay(10000);

    const sentMessage = await wbot.sendMessage(
      `${contact.number}@c.us`,
      `*${ticket.queue.dialogflow.name}:* ` + message
    );

    await verifyMessage(sentMessage, ticket, contact);
    setTimeout(async () => {
      await ToggleUseDialogflowService({
        contactId: ticket.contact.id.toString(),
        setUseDialogFlow: { useDialogflow: true }
      });
      await UpdateTicketService({
        ticketId: ticket.id,
        ticketData: { status: "closed" }
      });
    }, 3000);
  } else {
    const sentMessage = await wbot.sendMessage(
      `${contact.number}@c.us`,
      `*${ticket.queue.dialogflow.name}:* ` + message
    );

    await verifyMessage(sentMessage, ticket, contact);
    await delay(5000);
  }

  if (sendImage) {
    const newMedia = await MessageMedia.fromUrl(sendImage, {
      unsafeMime: true
    });
    const sentMessage = await wbot.sendMessage(
      `${contact.number}@c.us`,
      newMedia,
      {
        sendAudioAsVoice: true
      }
    );

    await verifyMessage(sentMessage, ticket, contact);
    await ticket.update({ lastMessage: "📷 Foto" });
    await delay(5000);
  }
}

const isValidMsg = (msg: WbotMessage): boolean => {
  if (msg.from === "status@broadcast") return false;
  if (
    msg.type === "chat" ||
    msg.type === "audio" ||
    msg.type === "call_log" ||
    msg.type === "ptt" ||
    msg.type === "video" ||
    msg.type === "image" ||
    msg.type === "document" ||
    msg.type === "vcard" ||
    msg.type === "buttons_response" ||
    //msg.type === "multi_vcard" ||
    msg.type === "sticker" ||
    msg.type === "location"
  )
    return true;
  return false;
};

async function sendCallRejectMessage(call: WbotCall, wbot: Session) {
  if (call.fromMe) return;

  const contact = call.from;

  await wbot.sendMessage(
    `${contact}`,
    "_As chamadas de voz e vídeo por WhatsApp estão desabilitadas para este canal de atendimento, por favor, envie uma mensagem de *texto*._"
  );
}

const handleMessage = async (
  msg: WbotMessage,
  wbot: Session
): Promise<void> => {
  if (!isValidMsg(msg)) {
    return;
  }

  try {
    let msgContact: WbotContact;
    let groupContact: Contact | undefined;

    if (msg.fromMe) {
      // messages sent automatically by wbot have a special character in front of it
      // if so, this message was already been stored in database;
      if (/\u200e/.test(msg.body[0])) return;

      // media messages sent from me from cell phone, first comes with "hasMedia = false" and type = "image/ptt/etc"
      // in this case, return and let this message be handled by "media_uploaded" event, when it will have "hasMedia = true"

      if (
        !msg.hasMedia &&
        msg.type !== "location" &&
        msg.type !== "chat" &&
        msg.type !== "vcard"
        //&& msg.type !== "multi_vcard"
      )
        return;

      msgContact = await wbot.getContactById(msg.to);
    } else {
      const listSettingsService = await ListSettingsServiceOne({ key: "call" });
      var callSetting = listSettingsService?.value;
      msgContact = await msg.getContact();
    }

    const chat = await msg.getChat();

    if (chat.isGroup) {
      /*      let msgGroupContact;

      if (msg.fromMe) {
        msgGroupContact = await wbot.getContactById(msg.to);
      } else {
        msgGroupContact = await wbot.getContactById(msg.from);
      }

      groupContact = await verifyContact(msgGroupContact);
      */
      return;
    }
    const whatsapp = await ShowWhatsAppService(wbot.id!);

    const unreadMessages = msg.fromMe ? 0 : chat.unreadCount;

    const contact = await verifyContact(msgContact);

    if (
      unreadMessages === 0 &&
      whatsapp.farewellMessage &&
      formatBody(whatsapp.farewellMessage, contact) === msg.body
    )
      return;

    let ticket: Ticket;

    let findticket = await Ticket.findOne({
      where: {
        status: {
          [Op.or]: ["open", "pending"]
        },
        contactId: groupContact ? groupContact.id : contact.id
      }
    });
    if (!findticket && msg.fromMe) {
      logger.error("Whatsapp message sent outside whaticket app");
      return;
    } else {
      ticket = await FindOrCreateTicketService(
        contact,
        wbot.id!,
        unreadMessages,
        groupContact
      );
    }

    if (msg.hasMedia) {
      await verifyMediaMessage(msg, ticket, contact);
    } else {
      await verifyMessage(msg, ticket, contact);
    }

    if (
      !ticket.queue &&
      !chat.isGroup &&
      !msg.fromMe &&
      !ticket.userId &&
      whatsapp.queues.length >= 1
    ) {
      await verifyQueue(wbot, msg, ticket, contact);
    }

    if (
      !msg.fromMe &&
      !chat.isGroup &&
      ticket.queue &&
      ticket.queue.dialogflow &&
      contact.useDialogflow
    ) {
      const debouncedSentMessage = debounce(
        async () => {
          await sendDialogflowAwswer(wbot, ticket, msg, contact, chat);
        },
        8000,
        ticket.id
      );
      debouncedSentMessage();
    }

    if (msg.type === "audio" || msg.type === "ptt") {
      if (!msg.fromMe && !chat.isGroup && !contact.acceptAudioMessage) {
        const sentMessage = await wbot.sendMessage(
          `${contact.number}@c.us`,
          "_Infelizmente não conseguimos escutar nem enviar áudios por este canal de atendimento 😕, por favor, envie uma mensagem de *texto*._"
        );
        await verifyMessage(sentMessage, ticket, contact);
      }
    }

    if (msg.type === "vcard") {
      try {
        const array = msg.body.split("\n");
        const obj = [];
        let contact = "";
        for (let index = 0; index < array.length; index++) {
          const v = array[index];
          const values = v.split(":");
          for (let ind = 0; ind < values.length; ind++) {
            if (values[ind].indexOf("+") !== -1) {
              obj.push({ number: values[ind] });
            }
            if (values[ind].indexOf("FN") !== -1) {
              contact = values[ind + 1];
            }
          }
        }
        for await (const ob of obj) {
          const cont = await CreateContactService({
            name: contact,
            number: ob.number.replace(/\D/g, "")
          });
        }
      } catch (error) {
        console.log(error);
      }
    }

    /* if (msg.type === "multi_vcard") {
      try {
        const array = msg.vCards.toString().split("\n");
        let name = "";
        let number = "";
        const obj = [];
        const conts = [];
        for (let index = 0; index < array.length; index++) {
          const v = array[index];
          const values = v.split(":");
          for (let ind = 0; ind < values.length; ind++) {
            if (values[ind].indexOf("+") !== -1) {
              number = values[ind];
            }
            if (values[ind].indexOf("FN") !== -1) {
              name = values[ind + 1];
            }
            if (name !== "" && number !== "") {
              obj.push({
                name,
                number
              });
              name = "";
              number = "";
            }
          }
        }
        // eslint-disable-next-line no-restricted-syntax
        for await (const ob of obj) {
          try {
            const cont = await CreateContactService({
              name: ob.name,
              number: ob.number.replace(/\D/g, "")
            });
            conts.push({
              id: cont.id,
              name: cont.name,
              number: cont.number
            });
          } catch (error) {
            if (error.message === "ERR_DUPLICATED_CONTACT") {
              const cont = await GetContactService({
                name: ob.name,
                number: ob.number.replace(/\D/g, ""),
                email: ""
              });
              conts.push({
                id: cont.id,
                name: cont.name,
                number: cont.number
              });
            }
          }
        }
        msg.body = JSON.stringify(conts);
      } catch (error) {
        console.log(error);
      }
    } */

    if (msg.type === "call_log" && callSetting === "disabled") {
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        "_As chamadas de voz e vídeo estão desabilitadas para esse canal de atendimento por WhatsApp 🫤, por favor, envie uma mensagem de texto._"
      );
      await verifyMessage(sentMessage, ticket, contact);
    }
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling whatsapp message: Err: ${err}`);
  }
};

const handleMsgAck = async (msg: WbotMessage, ack: MessageAck) => {
  await new Promise(r => setTimeout(r, 500));

  const io = getIO();

  try {
    const messageToUpdate = await Message.findByPk(msg.id.id, {
      include: [
        "contact",
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        }
      ]
    });
    if (!messageToUpdate) {
      return;
    }
    await messageToUpdate.update({ ack });

    io.to(messageToUpdate.ticketId.toString()).emit("appMessage", {
      action: "update",
      message: messageToUpdate
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack. Err: ${err}`);
  }
};

const wbotMessageListener = (wbot: Session): void => {
  wbot.on("message_create", async msg => {
    handleMessage(msg, wbot);
  });

  wbot.on("media_uploaded", async msg => {
    handleMessage(msg, wbot);
  });

  wbot.on("message_ack", async (msg, ack) => {
    handleMsgAck(msg, ack);
  });

  wbot.on("call", async call => {
    const listSettingsService = await ListSettingsServiceOne({ key: "call" });
    var callSetting = listSettingsService?.value;

    if (callSetting === "disabled") {
      await call.reject();
      sendCallRejectMessage(call, wbot);
    }
  });
};

export { wbotMessageListener, handleMessage };
