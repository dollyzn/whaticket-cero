import React, { useState, useEffect, useRef, useContext } from "react";

import { useHistory, useParams } from "react-router-dom";
import { parseISO, format, isSameDay } from "date-fns";
import clsx from "clsx";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemAvatar from "@material-ui/core/ListItemAvatar";
import Typography from "@material-ui/core/Typography";
import Avatar from "@material-ui/core/Avatar";
import Divider from "@material-ui/core/Divider";
import Badge from "@material-ui/core/Badge";
import IconButton from "@material-ui/core/IconButton";
import { i18n } from "../../translate/i18n";
import DoneIcon from "@material-ui/icons/Done";
import ReplayIcon from "@material-ui/icons/Replay";
import api from "../../services/api";
import ClearOutlinedIcon from "@material-ui/icons/ClearOutlined";
//import ButtonWithSpinner from "../ButtonWithSpinner";
import MarkdownWrapper from "../MarkdownWrapper";
import { Tooltip } from "@material-ui/core";
import { AuthContext } from "../../context/Auth/AuthContext";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  ticket: {
    position: "relative",
  },

  pendingTicket: {
    cursor: "unset",
  },

  noTicketsDiv: {
    display: "flex",
    height: "100px",
    margin: 40,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },

  noTicketsText: {
    textAlign: "center",
    color: "rgb(104, 121, 146)",
    fontSize: "14px",
    lineHeight: "1.4",
  },

  noTicketsTitle: {
    textAlign: "center",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0px",
  },

  contactNameWrapper: {
    display: "flex",
    justifyContent: "space-between",
  },

  lastMessageTime: {
    left: 35,
    top: "20px",
    position: "relative",
    backgroundColor: "primary",
    borderRadius: 10,
    paddingLeft: 5,
    paddingRight: 5,
    padding: 1,
  },

  closedBadge: {
    alignSelf: "center",
    justifySelf: "flex-end",
    marginRight: 32,
    marginLeft: "auto",
  },

  contactLastMessage: {
    paddingRight: 20,
  },

  newMessagesCount: {
    alignSelf: "center",
    marginRight: 8,
    marginLeft: "auto",
    bottom: 28,
    left: 53,
  },

  bottomButton: {
    top: "10px",
    left: 20,
  },

  badgeStyle: {
    top: 2,
    color: "white",
    backgroundColor: green[500],
  },

  acceptButton: {
    position: "absolute",
    left: "50%",
  },

  ticketQueueColor: {
    flex: "none",
    width: "8px",
    height: "100%",
    position: "absolute",
    top: "0%",
    left: "0%",
  },

  userTag: {
    position: "absolute",
    marginRight: 5,
    right: 26,
    bottom: 35,
    background: "#2576D2",
    color: "#ffffff",
    border: "1px solid #CCC",
    padding: 1,
    paddingLeft: 5,
    paddingRight: 5,
    borderRadius: 10,
    fontSize: "0.9em",
  },
}));

const TicketListItem = ({ ticket }) => {
  const classes = useStyles();
  const history = useHistory();
  const [, setLoading] = useState(false);
  const { ticketId } = useParams();
  const isMounted = useRef(true);
  const [, setUseDialogflow] = useState(ticket.contact.useDialogflow);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleReopenTicket = async (id) => {
    setLoading(true);
    try {
      const contact = await api.put(
        `/contacts/toggleUseDialogflow/${ticket.contact.id}`,
        {
          useDialogflow: false,
        }
      );
      setUseDialogflow(contact.data.useDialogflow);
      await api.put(`/tickets/${id}`, {
        status: "open",
        userId: user?.id,
      });
      history.push("/tickets");
    } catch (err) {
      setLoading(false);
      toastError(err);
    }
    if (isMounted.current) {
      setLoading(false);
    }
    history.push(`/tickets/${id}`);
  };

  const handleAcepptTicket = async (id) => {
    setLoading(true);
    try {
      const contact = await api.put(
        `/contacts/toggleUseDialogflow/${ticket.contact.id}`,
        {
          useDialogflow: false,
        }
      );
      setUseDialogflow(contact.data.useDialogflow);
      await api.put(`/tickets/${id}`, {
        status: "open",
        userId: user?.id,
      });
      history.push("/tickets");
    } catch (err) {
      setLoading(false);
      toastError(err);
    }
    if (isMounted.current) {
      setLoading(false);
    }
    history.push(`/tickets/${id}`);
  };

  const handleClosedTicket = async (id) => {
    setLoading(true);
    try {
      const contact = await api.put(
        `/contacts/toggleUseDialogflow/${ticket.contact.id}`,
        {
          useDialogflow: true,
        }
      );
      setUseDialogflow(contact.data.useDialogflow);
      await api.put(`/tickets/${id}`, {
        status: "closed",
        userId: user?.id,
      });
      history.push("/tickets");
    } catch (err) {
      setLoading(false);
      toastError(err);
    }
    if (isMounted.current) {
      setLoading(false);
    }
    //history.push(`/tickets/${id}`);
  };

  const handleSelectTicket = (id) => {
    history.push(`/tickets/${id}`);
  };

  function contDays() {
    const day = 86400000;

    let dateini = parseISO(ticket.updatedAt);
    let dateend = new Date();

    let date_ini = dateini.getTime();
    let date_end = dateend.getTime();

    let diff = date_end - date_ini;

    let dias = Math.floor(diff / day);

    let cnt;

    if (dias === 0) {
      cnt = format(parseISO(ticket.updatedAt), "HH:mm");
    } else {
      if (dias === 1) {
        cnt = "Há " + dias + " dia";
      } else {
        cnt = "Há " + dias + " dias";
      }
    }

    return cnt;
  }

  return (
    <React.Fragment key={ticket.id}>
      <ListItem
        dense
        button
        onClick={(e) => {
          handleSelectTicket(ticket.id);
        }}
        selected={ticketId && +ticketId === ticket.id}
        className={clsx(classes.ticket, {
          [classes.pendingTicket]: ticket.status === "pending",
        })}
      >
        <Tooltip
          arrow
          placement="right"
          title={ticket.queue?.name || "Sem fila"}
        >
          <span
            style={{ backgroundColor: ticket.queue?.color || "#7C7C7C" }}
            className={classes.ticketQueueColor}
          ></span>
        </Tooltip>
        <ListItemAvatar>
          <Avatar src={ticket?.contact?.profilePicUrl} />
        </ListItemAvatar>
        <ListItemText
          disableTypography
          primary={
            <span className={classes.contactNameWrapper}>
              <Typography
                noWrap
                component="span"
                variant="body2"
                color="textPrimary"
              >
                {ticket.contact.name}
              </Typography>
              {ticket.lastMessage && (
                <Typography
                  className={classes.lastMessageTime}
                  component="span"
                  variant="body2"
                  color="textSecondary"
                >
                  {isSameDay(parseISO(ticket.updatedAt), new Date()) ? (
                    <>{format(parseISO(ticket.updatedAt), "HH:mm")}</>
                  ) : (
                    <>{contDays()}</>
                  )}
                </Typography>
              )}
              {ticket.whatsappId && (
                <div
                  className={classes.userTag}
                  title={i18n.t("ticketsList.connectionTitle")}
                >
                  {ticket.whatsapp?.name}
                </div>
              )}
            </span>
          }
          secondary={
            <span className={classes.contactNameWrapper}>
              <Typography
                className={classes.contactLastMessage}
                noWrap
                component="span"
                variant="body2"
                color="textSecondary"
              >
                {ticket.lastMessage ? (
                  <MarkdownWrapper>{ticket.lastMessage}</MarkdownWrapper>
                ) : (
                  <br />
                )}
              </Typography>

              <Badge
                overlap="rectangular"
                className={classes.newMessagesCount}
                badgeContent={ticket.unreadMessages}
                classes={{
                  badge: classes.badgeStyle,
                }}
              />
            </span>
          }
        />
        {ticket.status === "pending" && (
          <IconButton
            className={classes.bottomButton}
            color="primary"
            onClick={(e) => handleAcepptTicket(ticket.id)}
          >
            <DoneIcon />
          </IconButton>
        )}
        {ticket.status === "open" && (
          <IconButton
            className={classes.bottomButton}
            color="primary"
            onClick={(e) => handleClosedTicket(ticket.id)}
          >
            <ClearOutlinedIcon />
          </IconButton>
        )}
        {ticket.status === "closed" && (
          <IconButton
            className={classes.bottomButton}
            color="primary"
            onClick={(e) => handleReopenTicket(ticket.id)}
          >
            <ReplayIcon />
          </IconButton>
        )}
      </ListItem>
      <Divider variant="inset" component="li" />
    </React.Fragment>
  );
};

export default TicketListItem;
