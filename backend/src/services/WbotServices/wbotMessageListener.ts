import { join } from "path";
import { promisify } from "util";
import { readFile, writeFile } from "fs";
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
  List,
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
import { Lists, Button, Booking } from "../../@types/dialogparams";
import {
  createAppointmentBooking,
  listSlotsAvailable,
  listServices
} from "./ReservioApiRequests";

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
    media.filename = `${msg.timestamp}.${ext}`;
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

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const sendDialogflowAwswer = async (
  wbot: Session,
  ticket: Ticket,
  msg: WbotMessage,
  contact: Contact,
  chat: Chat,
  inputAudio: string | undefined
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
    ticket.queue.dialogflow.language,
    inputAudio
  );

  if (!dialogFlowReply) {
    chat.sendStateTyping();
    await delay(3000);
    const sentMessage = await wbot.sendMessage(
      `${contact.number}@c.us`,
      `*${ticket.queue.dialogflow.name}:* 🤔 Não consegui entender`
    );

    await verifyMessage(sentMessage, ticket, contact);
    return;
  }

  if (dialogFlowReply.endConversation) {
    await ToggleUseDialogflowService({
      contactId: ticket.contact.id.toString(),
      setUseDialogFlow: { useDialogflow: false }
    });
  }

  const image = dialogFlowReply.parameters.image
    ? dialogFlowReply.parameters.image.stringValue
    : undefined;

  //limited to 3 itens
  const button = dialogFlowReply.parameters.button1
    ? dialogFlowReply.parameters
    : undefined;

  const booking = dialogFlowReply.parameters.booking
    ? dialogFlowReply.parameters
    : undefined;

  //limited to 10 itens
  const list = dialogFlowReply.parameters.option1
    ? dialogFlowReply.parameters
    : undefined;

  const react = dialogFlowReply.parameters.react?.stringValue
    ? dialogFlowReply.parameters.react.stringValue
    : undefined;

  let base64EncodedAudio = dialogFlowReply.encodedAudio.toString("base64");
  const audio = base64EncodedAudio ? base64EncodedAudio : undefined;

  chat.sendStateTyping();
  await delay(3000);

  let lastMessage;

  for (let message of dialogFlowReply.responses) {
    lastMessage = message.text.text[0];
  }
  for (let message of dialogFlowReply.responses) {
    await sendDelayedMessages(
      wbot,
      ticket,
      contact,
      msg,
      chat,
      message.text.text[0],
      lastMessage,
      image,
      button,
      booking,
      list,
      audio,
      react
    );
  }
};

async function sendDelayedMessages(
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  msg: WbotMessage,
  chat: Chat,
  message: string,
  lastMessage: string,
  sendImage: string | undefined,
  sendButtonMessage: Button | undefined,
  createBooking: Booking | undefined,
  sendListMessage: Lists | undefined,
  audio: string | undefined,
  react: string | undefined
) {
  const whatsapp = await ShowWhatsAppService(wbot.id!);
  const farewellMessage = whatsapp.farewellMessage.replace(/[_*]/g, "");

  if (react) {
    const test =
      /(\u00a9|\u00ae|[\u2000-\u3300]|\ud83c[\ud000-\udfff]|\ud83d[\ud000-\udfff]|\ud83e[\ud000-\udfff])/g.test(
        react
      );
    if (test) {
      msg.react(react);
      await delay(2000);
    }
  }

  if (createBooking?.email.stringValue) {
    const booking = createBooking.booking?.stringValue
      ? createBooking.booking.stringValue
      : undefined;
    const unity = createBooking.unity?.stringValue
      ? createBooking.unity.stringValue
      : undefined;
    const service = createBooking.service?.stringValue
      ? createBooking.service?.stringValue
      : undefined;
    const name = createBooking.name?.stringValue
      ? createBooking.name.stringValue
      : undefined;
    const email = createBooking.email?.stringValue
      ? createBooking.email.stringValue
      : undefined;
    const date = createBooking.start?.stringValue
      ? createBooking.start.stringValue
      : undefined;
    const previous = createBooking.previous?.stringValue
      ? createBooking.previous?.stringValue
      : undefined;
    const unityName = createBooking.unityName?.stringValue
      ? createBooking.unityName?.stringValue
      : undefined;

    await ToggleUseDialogflowService({
      contactId: ticket.contact.id.toString(),
      setUseDialogFlow: { useDialogflow: false }
    });
    if (booking === "service") {
      await listServices(wbot, ticket, contact, chat, unity);
    }
    if (booking === "timeSlot") {
      await listSlotsAvailable(
        wbot,
        ticket,
        contact,
        chat,
        unity,
        service,
        date
      );
    }
    if (booking === "createBooking") {
      await createAppointmentBooking(
        wbot,
        ticket,
        contact,
        chat,
        unity,
        service,
        name,
        date,
        previous,
        email,
        unityName
      );
    }
  }

  if (sendButtonMessage && message === lastMessage) {
    let options;
    function listButtonOptions(objButton: any) {
      let i = 0;
      let options = [];

      for (let opt in objButton) {
        options[i] = { body: objButton[opt].stringValue };
        i++;
      }

      return options;
    }

    options = listButtonOptions(sendButtonMessage);

    let button = new Buttons(
      `*${ticket.queue.dialogflow.name}:* ${message}`,
      options
    );

    const sentMessage = await wbot.sendMessage(
      `${contact.number}@c.us`,
      button
    );

    await verifyMessage(sentMessage, ticket, contact);
    if (audio) {
      await delay(500);
      chat.sendStateRecording();
      await delay(5000);
    }
  } else if (sendListMessage && message === lastMessage) {
    let options;

    function listOptions(listObj: any) {
      let i = 0;
      let options = [];
      for (let opt in listObj) {
        options[i] = { title: listObj[opt].stringValue };
        i++;
      }
      return options;
    }

    options = listOptions(sendListMessage);

    let sections = [
      {
        title: "Opções",
        rows: options
      }
    ];

    let list = new List(
      `*${ticket.queue.dialogflow.name}:* ` + message,
      "Clique aqui",
      sections
    );

    const sentMessage = await wbot.sendMessage(`${contact.number}@c.us`, list);

    await verifyMessage(sentMessage, ticket, contact);
    if (audio) {
      await delay(500);
      chat.sendStateRecording();
      await delay(5000);
    }
  } else {
    const sentMessage = await wbot.sendMessage(
      `${contact.number}@c.us`,
      `*${ticket.queue.dialogflow.name}:* ` + message
    );

    await verifyMessage(sentMessage, ticket, contact);
    if (message != lastMessage) {
      await delay(500);
      chat.sendStateTyping();
    } else if (audio) {
      await delay(500);
      chat.sendStateRecording();
    }
    await delay(5000);
  }

  if (audio && message === lastMessage) {
    const newMedia = new MessageMedia("audio/ogg", audio);

    const sentMessage = await wbot.sendMessage(
      `${contact.number}@c.us`,
      newMedia,
      {
        sendAudioAsVoice: true
      }
    );

    await verifyMessage(sentMessage, ticket, contact);
  }

  if (sendImage && message === lastMessage) {
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
  }

  if (farewellMessage && message.includes(farewellMessage)) {
    await delay(10000);
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
    msg.type === "list" ||
    msg.type === "list_response" ||
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
      let inputAudio: string | undefined;

      if (msg.type === "ptt") {
        let filename = `${msg.timestamp}.ogg`;
        readFile(
          join(__dirname, "..", "..", "..", "public", filename),
          "base64",
          (err, data) => {
            inputAudio = data;
            if (err) {
              logger.error(err);
            }
          }
        );
      } else {
        inputAudio = undefined;
      }

      const debouncedSentMessage = debounce(
        async () => {
          await sendDialogflowAwswer(
            wbot,
            ticket,
            msg,
            contact,
            chat,
            inputAudio
          );
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

export { wbotMessageListener, handleMessage, verifyMessage };
