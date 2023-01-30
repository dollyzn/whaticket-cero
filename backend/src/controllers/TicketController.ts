import { Request, Response } from "express";
import { getIO } from "../libs/socket";

import CreateTicketService from "../services/TicketServices/CreateTicketService";
import DeleteTicketService from "../services/TicketServices/DeleteTicketService";
import ListTicketsService from "../services/TicketServices/ListTicketsService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import formatBody from "../helpers/Mustache";
import ShowUserService from "../services/UserServices/ShowUserService";
import ShowQueueService from "../services/QueueService/ShowQueueService";
import ListSettingsServiceOne from "../services/SettingServices/ListSettingsServiceOne";
import { isUndefined } from "util";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
  status: string;
  date: string;
  showAll: string;
  withUnreadMessages: string;
  queueIds: string;
};

interface TicketData {
  contactId: number;
  status: string;
  queueId: number;
  userId: number;
  transf: boolean;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const {
    pageNumber,
    status,
    date,
    searchParam,
    showAll,
    queueIds: queueIdsStringified,
    withUnreadMessages
  } = req.query as IndexQuery;

  const userId = req.user.id;

  let queueIds: number[] = [];

  if (queueIdsStringified) {
    queueIds = JSON.parse(queueIdsStringified);
  }

  const { tickets, count, hasMore } = await ListTicketsService({
    searchParam,
    pageNumber,
    status,
    date,
    showAll,
    userId,
    queueIds,
    withUnreadMessages
  });

  return res.status(200).json({ tickets, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { contactId, status, userId }: TicketData = req.body;

  const ticket = await CreateTicketService({ contactId, status, userId });

  const io = getIO();
  io.to(ticket.status).emit("ticket", {
    action: "update",
    ticket
  });

  return res.status(200).json(ticket);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.params;

  const contact = await ShowTicketService(ticketId);

  return res.status(200).json(contact);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;

  const ticketData: TicketData = req.body;

  const ticketShow = await ShowTicketService(ticketId);

  const { ticket } = await UpdateTicketService({ ticketData, ticketId });

  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  const settingsTransfTicket = await ListSettingsServiceOne({
    key: "transferTicket"
  });
  const transfTickets = JSON.stringify("enabled");

  if (
    JSON.stringify(settingsTransfTicket?.value) === transfTickets &&
    ticketData.transf
  ) {
    if (
      (ticketShow.userId !== ticketData.userId &&
        ticketShow.queueId === ticketData.queueId) ||
      ticketData.queueId === undefined
    ) {
      const nome = await ShowUserService(ticketData.userId);
      const msgtxt = "_Você foi transferido(a) para outro atendente_";
      const msgtxt2 =
        "_Por favor aguarde, *" +
        nome.name +
        "* irá te atender assim que possível_";
      await SendWhatsAppMessage({ body: msgtxt, ticket });
      await delay(1000);
      await SendWhatsAppMessage({ body: msgtxt2, ticket });
    } else if (ticketData.userId) {
      const { name } = await ShowQueueService(ticketData.queueId);
      const nome = await ShowUserService(ticketData.userId);
      const msgtxt =
        "_Você foi transferido(a) para a fila *" +
        name.replace(/Fila [0-9] /gi, "") +
        "*._";
      const msgtxt2 =
        "_Por favor aguarde, *" +
        nome.name +
        "* irá te atender assim que possível_";
      await SendWhatsAppMessage({ body: msgtxt, ticket });
      await delay(1000);
      await SendWhatsAppMessage({ body: msgtxt2, ticket });
    } else {
      const { name } = await ShowQueueService(ticketData.queueId);
      const msgtxt =
        "_Você foi transferido(a) para a fila *" +
        name.replace(/Fila [0-9] /gi, "") +
        "*._";
      await SendWhatsAppMessage({ body: msgtxt, ticket });
    }
  }

  if (ticket.status === "closed") {
    const whatsapp = await ShowWhatsAppService(ticket.whatsappId);

    const { farewellMessage } = whatsapp;

    if (farewellMessage) {
      await SendWhatsAppMessage({
        body: formatBody(farewellMessage, ticket.contact),
        ticket
      });
    }
  }

  return res.status(200).json(ticket);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { ticketId } = req.params;

  const ticket = await DeleteTicketService(ticketId);

  const io = getIO();
  io.to(ticket.status).to(ticketId).to("notification").emit("ticket", {
    action: "delete",
    ticketId: +ticketId
  });

  return res.status(200).json({ message: "ticket deleted" });
};
