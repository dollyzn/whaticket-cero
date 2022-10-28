import { Request, Response } from "express";
import * as Yup from "yup";
import AppError from "../errors/AppError";
import GetDefaultWhatsApp from "../helpers/GetDefaultWhatsApp";
import SetTicketMessagesAsRead from "../helpers/SetTicketMessagesAsRead";
import Message from "../models/Message";
import Whatsapp from "../models/Whatsapp";
import CreateOrUpdateContactService from "../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../services/TicketServices/FindOrCreateTicketService";
import ShowTicketService from "../services/TicketServices/ShowTicketService";
import CheckIsValidContact from "../services/WbotServices/CheckIsValidContact";
import CheckContactNumber from "../services/WbotServices/CheckNumber";
import GetProfilePicUrl from "../services/WbotServices/GetProfilePicUrl";
import SendWhatsAppMedia from "../services/WbotServices/SendWhatsAppMedia";
import SendWhatsAppMessage from "../services/WbotServices/SendWhatsAppMessage";
import UpdateTicketService from "../services/TicketServices/UpdateTicketService";

type WhatsappData = {
  whatsappId: number;
}

type MessageData = {
  body: string;
  fromMe: boolean;
  read: boolean;
  quotedMsg?: Message;
};

interface ContactData {
  number: string;
}

const createContact = async (
  whatsappId: number | undefined,
  newContact: string
) => {
  await CheckIsValidContact(newContact);

  const validNumber: any = await CheckContactNumber(newContact);

  const profilePicUrl = await GetProfilePicUrl(validNumber);

  const number = validNumber;

  const contactData = {
    name: `${number}`,
    number,
    profilePicUrl,
    isGroup: false
  };

  const contact = await CreateOrUpdateContactService(contactData);

  let whatsapp:Whatsapp | null;

  if(whatsappId === undefined) {
    whatsapp = await GetDefaultWhatsApp();
  } else {
    whatsapp = await Whatsapp.findByPk(whatsappId);

    if(whatsapp === null) {
      throw new AppError(`whatsapp #${whatsappId} not found`);
    }
  }

  const createTicket = await FindOrCreateTicketService(
    contact,
    whatsapp.id,
    1
  );

  const ticket = await ShowTicketService(createTicket.id);

  SetTicketMessagesAsRead(ticket);

  return ticket;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const newContact: ContactData = req.body;
  const { whatsappId }: WhatsappData = req.body;
  const { body, quotedMsg }: MessageData = req.body;
  const medias = req.files as Express.Multer.File[];

  newContact.number = newContact.number.replace("-", "").replace(" ", "");

  const schema = Yup.object().shape({
    number: Yup.string()
      .required()
      .matches(/^\d+$/, "Invalid number format. Only numbers is allowed.")
  });

  try {
    await schema.validate(newContact);
  } catch (err: any) {
    throw new AppError(err.message);
  }

  const contactAndTicket = await createContact(whatsappId, newContact.number);

  function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
  }

  if (medias) {
    await Promise.all(
      medias.map(async (media: Express.Multer.File) => {
        await SendWhatsAppMedia({ body, media, ticket: contactAndTicket });
      })
    );
  } else { 
   if(body == "Cero2"){
    var msgtxt = "Seu feedback é importante para a Cero Imagem Unidade II. Poste uma avaliação no nosso perfil.\nhttps://g.page/cero-imagem/review?rc";
    await SendWhatsAppMessage({body: msgtxt, ticket: contactAndTicket, quotedMsg});
    await delay(300);
  }

   if(body == "CeroM"){
    var msgtxt = "Seu feedback é importante para a Cero Imagem Campos. Poste uma avaliação no nosso perfil.\nhttps://g.page/r/CT73CTwDleiEEAg/review";
    await SendWhatsAppMessage({body: msgtxt, ticket: contactAndTicket, quotedMsg});
    await delay(300);
  }
 
   if(body == "CeroSFI"){
    var msgtxt = "Seu feedback é importante para a Cero Imagem São Francisco. Poste uma avaliação no nosso perfil.\nhttps://g.page/r/Ca29px2WRRA7EAg/review";
    await SendWhatsAppMessage({body: msgtxt, ticket: contactAndTicket, quotedMsg});
    await delay(300);
  }

  if(body == "CeroSJB"){
    var msgtxt = "Seu feedback é importante para a Cero Imagem São João da Barra. Poste uma avaliação no nosso perfil.\nhttps://g.page/cero-imagem-sjb/review?";
    await SendWhatsAppMessage({body: msgtxt, ticket: contactAndTicket, quotedMsg});
    await delay(300);
  }

   if(body == "Nome não definido" || body == "Cero2" || body == "CeroM" || body == "CeroSFI" || body == "CeroSJB"){
  console.log("Nome do atendente não definido ou Mensagem de feedback enviada");
  }else{  
  await SendWhatsAppMessage({ body, ticket: contactAndTicket, quotedMsg });
  }
  }

  setTimeout(async () => {
    await UpdateTicketService({ticketId: contactAndTicket.id,ticketData: { status: "closed" }});}, 1000);
    //return res.send();
    return res.send({ error: "SUCCESS" });
};

