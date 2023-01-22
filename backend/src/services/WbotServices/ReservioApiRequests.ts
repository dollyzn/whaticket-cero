import { Client, List } from "whatsapp-web.js";

import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import ToggleUseDialogflowService from "../ContactServices/ToggleUseDialogflowContactService";
import { verifyMessage } from "./wbotMessageListener";

import axios from "axios";
import { addMinutes } from "date-fns";

interface Session extends Client {
  id?: number;
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const createAppointmentBooking = async (
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  unity: string | undefined,
  service: string | undefined,
  name: string | undefined,
  start: string | undefined,
  previous: string | undefined,
  email: string | undefined,
  unityName: string | undefined
): Promise<void> => {
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

  let hourSelected = new Date(start!);
  let dateSelected = new Date(previous!);
  let endDate = addMinutes(hourSelected, 15);

  let end = toIsoString(dateSelected, endDate);
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
      const date = new Date(start!);

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

      function maskContactNumber(num: string) {
        num = num.replace(/\D/g, "");
        num = num.replace(/^([0-9]{2})([0-9]{2})/g, "$1 ($2) ");
        num = num.replace(/(\d)(\d{4})$/, "$1-$2");
        return num;
      }

      let formatedNum = maskContactNumber(contact.number);
      formatedNum = `+${formatedNum}`;

      await delay(5000);
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        `Agendamento concluído com sucesso!\n\n*Nome:* ${name}\n*Número:* ${formatedNum}\n*E-mail:* ${email}\n*Em:* ${unityName}\n*Data:* ${dy}/${mon}/${year}\n*Hora:* ${hour}:${min}`
      );
      await delay(3000);
      const sentMessage2 = await wbot.sendMessage(
        `${contact.number}@c.us`,
        `*${ticket.queue.dialogflow.name}:* Posso ajudar com algo mais?`
      );
      await ToggleUseDialogflowService({
        contactId: ticket.contact.id.toString(),
        setUseDialogFlow: { useDialogflow: true }
      });
      await verifyMessage(sentMessage, ticket, contact);
      await verifyMessage(sentMessage2, ticket, contact);
      await delay(5000);
    })
    .catch(async function (error) {
      await delay(5000);
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        `*${ticket.queue.dialogflow.name}:* Houve algum erro, tente novamente mais tarde.`
      );
      await delay(3000);
      const sentMessage2 = await wbot.sendMessage(
        `${contact.number}@c.us`,
        `*${ticket.queue.dialogflow.name}:* Você também pode realizar o exame por ordem de chegada! Posso ajudar com algo mais?`
      );

      await verifyMessage(sentMessage, ticket, contact);
      await verifyMessage(sentMessage2, ticket, contact);
      await ToggleUseDialogflowService({
        contactId: ticket.contact.id.toString(),
        setUseDialogFlow: { useDialogflow: true }
      });
      await delay(5000);
    });
};

const listServices = async (
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  unity: string | undefined
): Promise<void> => {
  const options = {
    method: "GET",
    url: `https://api.reservio.com/v2/businesses/${unity}/services`,
    headers: {
      cookie: "_nss=1",
      Accept: "application/vnd.api+json",
      Authorization: "Bearer accessToken"
    }
  };

  axios
    .request(options)
    .then(async function (response) {
      let i = 0;
      let options = [];
      for (let serviceName of response.data.data) {
        options[i] = { title: serviceName.attributes.name };
        i++;
      }

      let sections = [
        {
          title: "Serviços",
          rows: options
        }
      ];
      let list = new List(
        "Selecione um",
        "Clique aqui",
        sections,
        "Serviços disponíveis"
      );
      await delay(5000);
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@c.us`,
        list
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
        `*${ticket.queue.dialogflow.name}:* Houve algum erro, selecione outra unidade ou tente mais tarde.`
      );
      await delay(3000);
      const sentMessage2 = await wbot.sendMessage(
        `${contact.number}@c.us`,
        `*${ticket.queue.dialogflow.name}:* Para recomeçar envie "agendar" novamente.`
      );

      await verifyMessage(sentMessage, ticket, contact);
      await verifyMessage(sentMessage2, ticket, contact);
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
  unity: string | undefined,
  service: string | undefined,
  start: string | undefined
): Promise<void> => {
  const date = new Date(start!);

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
    }
  };

  axios
    .request(options)
    .then(async function (response) {
      let i = 0;
      let options = [];
      for (let slot of response.data.data) {
        let date = new Date(slot.attributes.start);
        let hours = date.getHours();
        let minutes = date.getMinutes();
        let hour;
        let min;
        let desc;

        if (hours < 10) {
          hour = `0${hours}`;
        } else {
          hour = hours;
        }
        if (hour < 12) {
          desc = "da Manhã";
        } else {
          desc = "da Tarde";
        }
        if (minutes < 10) {
          min = `0${minutes}`;
        } else {
          min = minutes;
        }

        options[i] = { title: `${hour}:${min}`, description: `${desc}` };
        i++;
      }

      if (options.length === 0) {
        const date = new Date(start!);

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
        let sections = [
          {
            title: "Horários",
            rows: options
          }
        ];
        let list = new List(
          "Selecione um",
          "Clique aqui",
          sections,
          "Horários disponíveis"
        );
        await delay(5000);
        const sentMessage = await wbot.sendMessage(
          `${contact.number}@c.us`,
          list
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
        `*${ticket.queue.dialogflow.name}:* Houve algum erro, tente novamente mais tarde`
      );
      await delay(3000);
      const sentMessage2 = await wbot.sendMessage(
        `${contact.number}@c.us`,
        `*${ticket.queue.dialogflow.name}:*Posso ajudar com algo mais?`
      );

      await verifyMessage(sentMessage, ticket, contact);
      await verifyMessage(sentMessage2, ticket, contact);
      await ToggleUseDialogflowService({
        contactId: ticket.contact.id.toString(),
        setUseDialogFlow: { useDialogflow: true }
      });
      await delay(5000);
    });
};

export { createAppointmentBooking, listSlotsAvailable, listServices };
