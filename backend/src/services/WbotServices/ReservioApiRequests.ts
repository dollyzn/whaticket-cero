import { Client } from "whatsapp-web.js";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ToggleUseDialogflowService from "../ContactServices/ToggleUseDialogflowContactService";
import { verifyMessage } from "./wbotMessageListener";

import axios from "axios";

interface Session extends Client {
  id?: number;
}

const createAppointmentBooking = async (
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  unity: string,
  name: string,
  start: string,
  previous: string | undefined,
  end: string,
  email: string
): Promise<void> => {
  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function toIsoString(date: Date, dateInc: Date) {
    var tzo = -date.getTimezoneOffset(),
      dif = tzo >= 0 ? "+" : "-",
      pad = function (num: number) {
        return (num < 10 ? "0" : "") + num;
      };

    if (dateInc.getHours() > 18) {
      return (
        date.getFullYear() +
        "-" +
        pad(date.getMonth() + 1) +
        "-" +
        pad(date.getDate()) +
        "T" +
        pad(dateInc.getHours() - 12) +
        ":" +
        pad(dateInc.getMinutes()) +
        ":" +
        pad(dateInc.getSeconds()) +
        dif +
        pad(Math.floor(Math.abs(tzo) / 60)) +
        ":" +
        pad(Math.abs(tzo) % 60)
      );
    } else {
      return (
        date.getFullYear() +
        "-" +
        pad(date.getMonth() + 1) +
        "-" +
        pad(date.getDate()) +
        "T" +
        pad(dateInc.getHours()) +
        ":" +
        pad(dateInc.getMinutes()) +
        ":" +
        pad(dateInc.getSeconds()) +
        dif +
        pad(Math.floor(Math.abs(tzo) / 60)) +
        ":" +
        pad(Math.abs(tzo) % 60)
      );
    }
  }

  let unit: string;
  let service;

  if (unity === "274d49ec-b5bc-4c22-b77f-b928181c7a13") {
    unit = "Cero Unidade II";
    service = "b24648fc-16b5-4b89-a941-710583c581ec";
  }
  if (unity === "ad86045f-554f-4294-8228-7ed93e34fb54") {
    unit = "Cero Matriz";
    service = "6ec28aa9-41e5-4d55-8120-71b760c4eee8";
  }
  if (unity === "e8dde240-770c-45be-9d2a-7a5abb1a2a0e") {
    unit = "Cero Macaé";
    service = "f3f901f8-74fb-476f-9708-42c079240f32";
  }
  if (unity === "c7d4159c-b16e-49df-98db-e3150ed4df69") {
    unit = "Cero São Francisco";
    service = "2302d07f-d218-4820-868b-53dfe67cdf3f";
  }
  if (unity === "f330cefd-3b50-4da6-92a7-7e44fdc6535d") {
    unit = "Cero São João da Barra";
    service = "6b3e66ee-a5e7-4f61-ab30-d5e2520bd677";
  }

  let hourSelected = new Date(start);
  let dateSelected = new Date(previous!);
  start = toIsoString(dateSelected, hourSelected);

  const options = {
    method: "POST",
    url: `https://api.reservio.com/v2/businesses/${unity}/bookings`,
    headers: {
      cookie: "_nss=1",
      Accept: "application/vnd.api+json",
      Authorization: "Bearer accessToken"
    },
    data: {
      data: {
        type: "booking",
        attributes: {
          bookedClientName: name,
          note: "Agendamento feito pelo Pedro no WhatsApp"
        },
        relationships: {
          event: {
            data: {
              type: "event",
              attributes: {
                start: start,
                end: end,
                name: name,
                eventType: "appointment"
              },
              relationships: {
                service: {
                  data: {
                    type: "service",
                    id: service
                  }
                }
              }
            }
          },
          client: {
            data: {
              type: "client",
              attributes: {
                name: name,
                email: email,
                phone: contact.number
              }
            }
          }
        }
      }
    }
  };

  axios
    .request(options)
    .then(async function (response) {
      const date = new Date(start);

      let year = date.getFullYear();
      let month = date.getMonth() + 1;
      let day = date.getDate();
      let hour = date.getHours();
      let minutes = date.getMinutes();
      let mon;
      let dy;
      let min;

      if (month < 10) {
        mon = `0${month}`;
      } else {
        mon = month;
      }
      if (day < 10) {
        dy = `0${day}`;
      } else {
        dy = day;
      }
      if (minutes < 10) {
        min = `0${minutes}`;
      } else {
        min = minutes;
      }

      await delay(5000);
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        `*${ticket.queue.dialogflow.name}:*\nAgendamento concluído com sucesso!\n\n*Nome:* ${name}\n*Número:* ${contact.number}\n*E-mail:* ${email}\n*Em:* ${unit}\n*Data:* ${dy}/${mon}/${year}\n*Hora:* ${hour}:${min}\n\nPosso ajudar com algo mais?`
      );

      await verifyMessage(sentMessage, ticket, contact);
      await ToggleUseDialogflowService({
        contactId: ticket.contact.id.toString(),
        setUseDialogFlow: { useDialogflow: true }
      });
      await delay(5000);
    })
    .catch(async function (error) {
      await delay(5000);
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        `*${ticket.queue.dialogflow.name}:* Ocorreu um erro.\n\nVocê também pode realizar o exame por ordem de chegada! Posso ajudar com algo mais?`
      );

      await verifyMessage(sentMessage, ticket, contact);
      await ToggleUseDialogflowService({
        contactId: ticket.contact.id.toString(),
        setUseDialogFlow: { useDialogflow: true }
      });
      await delay(5000);
    });
};

const listSlotsAvailable = async (
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  unity: string,
  name: string,
  email: string,
  start: string
): Promise<void> => {
  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  let unit: string;
  let service;

  if (unity === "274d49ec-b5bc-4c22-b77f-b928181c7a13") {
    unit = "Cero Unidade II";
    service = "b24648fc-16b5-4b89-a941-710583c581ec";
  }
  if (unity === "ad86045f-554f-4294-8228-7ed93e34fb54") {
    unit = "Cero Matriz";
    service = "6ec28aa9-41e5-4d55-8120-71b760c4eee8";
  }
  if (unity === "e8dde240-770c-45be-9d2a-7a5abb1a2a0e") {
    unit = "Cero Macaé";
    service = "f3f901f8-74fb-476f-9708-42c079240f32";
  }
  if (unity === "c7d4159c-b16e-49df-98db-e3150ed4df69") {
    unit = "Cero São Francisco";
    service = "2302d07f-d218-4820-868b-53dfe67cdf3f";
  }
  if (unity === "f330cefd-3b50-4da6-92a7-7e44fdc6535d") {
    unit = "Cero São João da Barra";
    service = "6b3e66ee-a5e7-4f61-ab30-d5e2520bd677";
  }

  const date = new Date(start);

  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();
  let mon;
  let dy;

  if (month < 10) {
    mon = `0${month}`;
  } else {
    mon = month;
  }
  if (day < 10) {
    dy = `0${day}`;
  } else {
    dy = day;
  }

  const options = {
    method: "GET",
    url: `https://api.reservio.com/v2/businesses/${unity}/availability/booking-slots`,
    params: {
      "filter[from]": `${year}-${mon}-${dy}`,
      "filter[to]": `${year}-${mon}-${dy}`,
      "filter[serviceId]": service
    },
    headers: {
      cookie: "_nss=1",
      Accept: "application/vnd.api+json",
      Authorization: "Bearer accessToken"
    },
    data: {
      data: {
        type: "booking",
        attributes: {
          bookedClientName: name,
          note: "Solicitado pelo Pedro no WhatsApp"
        },
        relationships: {
          event: {
            data: {
              type: "event",
              attributes: {
                start: start,
                end: start,
                name: name,
                eventType: "appointment"
              },
              relationships: {
                service: {
                  data: {
                    type: "service",
                    id: service
                  }
                }
              }
            }
          },
          client: {
            data: {
              type: "client",
              attributes: {
                name: name,
                email: email,
                phone: contact.number
              }
            }
          }
        }
      }
    }
  };

  axios
    .request(options)
    .then(async function (response) {
      let options = "";
      for (let slot of response.data.data) {
        let date = new Date(slot.attributes.start);
        let hours = date.getHours();
        let minutes = date.getMinutes();
        let hour;
        let min;

        if (hours < 10) {
          hour = `0${hours}`;
        } else {
          hour = hours;
        }
        if (minutes < 10) {
          min = `0${minutes}`;
        } else {
          min = minutes;
        }

        options += `*${hour}:${min}*\n`;
      }

      if (!options) {
        const date = new Date(start);

        let year = date.getFullYear();
        let month = date.getMonth() + 1;
        let day = date.getDate();
        let mon;
        let dy;

        if (month < 10) {
          mon = `0${month}`;
        } else {
          mon = month;
        }
        if (day < 10) {
          dy = `0${day}`;
        } else {
          dy = day;
        }
        await delay(5000);
        const sentMessage = await wbot.sendMessage(
          `${contact.number}@c.us`,
          `*${ticket.queue.dialogflow.name}:* Infelizmente não há nenhum horário disponível para o dia ${dy}/${mon}/${year}.. Informe outra data`
        );

        await verifyMessage(sentMessage, ticket, contact);
        await ToggleUseDialogflowService({
          contactId: ticket.contact.id.toString(),
          setUseDialogFlow: { useDialogflow: true }
        });
        await delay(5000);
      } else {
        await delay(5000);
        const sentMessage = await wbot.sendMessage(
          `${contact.number}@c.us`,
          `*${ticket.queue.dialogflow.name}:* Os horários disponíveis para esse dia são\n\n${options}\nSelecione apenas um`
        );

        await verifyMessage(sentMessage, ticket, contact);
        await ToggleUseDialogflowService({
          contactId: ticket.contact.id.toString(),
          setUseDialogFlow: { useDialogflow: true }
        });
        await delay(5000);
      }
    })
    .catch(async function (error) {
      await delay(5000);
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        `*${ticket.queue.dialogflow.name}:* Houve algum erro, tente novamente mais tarde\n\nPosso ajudar com algo mais?`
      );

      await verifyMessage(sentMessage, ticket, contact);
      await ToggleUseDialogflowService({
        contactId: ticket.contact.id.toString(),
        setUseDialogFlow: { useDialogflow: true }
      });
      await delay(5000);
    });
};

export { createAppointmentBooking, listSlotsAvailable };
