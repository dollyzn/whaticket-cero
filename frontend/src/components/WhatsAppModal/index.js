import React, { useState, useEffect } from "react";
import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  Button,
  DialogActions,
  CircularProgress,
  TextField,
  Switch,
  FormControlLabel,
} from "@material-ui/core";

import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import QueueSelect from "../QueueSelect";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
  },

  multFieldLine: {
    display: "flex",
    "& > *:not(:last-child)": {
      marginRight: theme.spacing(1),
    },
  },

  multTimeFieldLine: {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    [theme.breakpoints.down("sm")]: {
      margin: 0,
      flexDirection: "column",
      alignItems: "flex-start",
      "& > *": {
        marginBottom: "-2px",
      },
    },
  },

  btnWrapper: {
    position: "relative",
  },

  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12,
  },
}));

const SessionSchema = Yup.object().shape({
  name: Yup.string()
    .min(2, "Too Short!")
    .max(50, "Too Long!")
    .required("Required"),
});

const WhatsAppModal = ({ open, onClose, whatsAppId }) => {
  const classes = useStyles();
  const initialState = {
    name: "",
    number: "",
    greetingMessage: "",
    farewellMessage: "",
    outServiceMessage: "",
    feedbackMessage: "",
    openingHours: "",
    closingHours: "",
    useoutServiceMessage: false,
    isDefault: false,
    requestCode: false,
  };
  const [whatsApp, setWhatsApp] = useState(initialState);
  const [selectedQueueIds, setSelectedQueueIds] = useState([]);

  useEffect(() => {
    const fetchSession = async () => {
      if (!whatsAppId) return;

      try {
        const { data } = await api.get(`whatsapp/${whatsAppId}`);
        setWhatsApp(data);

        const whatsQueueIds = data.queues?.map((queue) => queue.id);
        setSelectedQueueIds(whatsQueueIds);
      } catch (err) {
        toastError(err);
      }
    };
    fetchSession();
  }, [whatsAppId]);

  const handleSaveWhatsApp = async (values) => {
    const whatsappData = { ...values, queueIds: selectedQueueIds };

    try {
      if (whatsAppId) {
        await api.put(`/whatsapp/${whatsAppId}`, whatsappData);
      } else {
        await api.post("/whatsapp", whatsappData);
      }
      toast.success(i18n.t("whatsappModal.success"));
      handleClose();
    } catch (err) {
      toastError(err);
    }
  };

  const handleClose = () => {
    onClose();
    setWhatsApp(initialState);
  };

  return (
    <div className={classes.root}>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        scroll="paper"
      >
        <DialogTitle>
          {whatsAppId
            ? i18n.t("whatsappModal.title.edit")
            : i18n.t("whatsappModal.title.add")}
        </DialogTitle>
        <Formik
          initialValues={whatsApp}
          enableReinitialize={true}
          validationSchema={SessionSchema}
          onSubmit={(values, actions) => {
            setTimeout(() => {
              handleSaveWhatsApp(values);
              actions.setSubmitting(false);
            }, 400);
          }}
        >
          {({ values, touched, errors, isSubmitting }) => (
            <Form>
              <DialogContent dividers>
                <div className={classes.multFieldLine}>
                  <Field
                    as={TextField}
                    label={i18n.t("whatsappModal.form.name")}
                    autoFocus
                    name="name"
                    error={touched.name && Boolean(errors.name)}
                    helperText={touched.name && errors.name}
                    variant="outlined"
                    margin="dense"
                    className={classes.textField}
                  />
                  <FormControlLabel
                    control={
                      <Field
                        as={Switch}
                        color="primary"
                        name="isDefault"
                        checked={values.isDefault}
                      />
                    }
                    label={i18n.t("whatsappModal.form.default")}
                  />
                </div>
                <div className={classes.multFieldLine}>
                  <Field
                    as={TextField}
                    label={i18n.t("whatsappModal.form.number")}
                    name="number"
                    error={touched.number && Boolean(errors.number)}
                    helperText={touched.number && errors.number}
                    variant="outlined"
                    margin="dense"
                    className={classes.textField}
                    disabled={!values.requestCode}
                  />
                  <FormControlLabel
                    control={
                      <Field
                        as={Switch}
                        color="primary"
                        name="requestCode"
                        checked={values.requestCode}
                      />
                    }
                    label={i18n.t("whatsappModal.form.requestCode")}
                  />
                </div>
                <div>
                  <Field
                    as={TextField}
                    label={i18n.t("queueModal.form.greetingMessage")}
                    type="greetingMessage"
                    multiline
                    minRows={5}
                    maxRows={5}
                    fullWidth
                    name="greetingMessage"
                    error={
                      touched.greetingMessage && Boolean(errors.greetingMessage)
                    }
                    helperText={
                      touched.greetingMessage && errors.greetingMessage
                    }
                    variant="outlined"
                    margin="dense"
                  />
                </div>
                <div>
                  <Field
                    as={TextField}
                    label={i18n.t("whatsappModal.form.farewellMessage")}
                    type="farewellMessage"
                    multiline
                    minRows={5}
                    maxRows={5}
                    fullWidth
                    name="farewellMessage"
                    error={
                      touched.farewellMessage && Boolean(errors.farewellMessage)
                    }
                    helperText={
                      touched.farewellMessage && errors.farewellMessage
                    }
                    variant="outlined"
                    margin="dense"
                  />
                </div>
                <div>
                  <Field
                    as={TextField}
                    label={i18n.t("whatsappModal.form.outServiceMessage")}
                    type="outServiceMessage"
                    multiline
                    minRows={5}
                    maxRows={5}
                    fullWidth
                    name="outServiceMessage"
                    error={
                      touched.outServiceMessage &&
                      Boolean(errors.outServiceMessage)
                    }
                    helperText={
                      touched.outServiceMessage && errors.outServiceMessage
                    }
                    variant="outlined"
                    margin="dense"
                  />
                </div>
                <div>
                  <Field
                    as={TextField}
                    label={i18n.t("whatsappModal.form.feedbackMessage")}
                    type="feedbackMessage"
                    multiline
                    minRows={5}
                    maxRows={5}
                    fullWidth
                    name="feedbackMessage"
                    error={
                      touched.feedbackMessage && Boolean(errors.feedbackMessage)
                    }
                    helperText={
                      touched.feedbackMessage && errors.feedbackMessage
                    }
                    variant="outlined"
                    margin="dense"
                  />
                </div>
                <div className={classes.multTimeFieldLine}>
                  <Field
                    as={TextField}
                    label={i18n.t("whatsappModal.form.openingHours")}
                    type="time"
                    name="openingHours"
                    error={touched.openingHours && Boolean(errors.openingHours)}
                    helperText={touched.openingHours && errors.openingHours}
                    variant="outlined"
                    margin="dense"
                  />
                  <Field
                    as={TextField}
                    label={i18n.t("whatsappModal.form.closingHours")}
                    type="time"
                    name="closingHours"
                    error={touched.closingHours && Boolean(errors.closingHours)}
                    helperText={touched.closingHours && errors.closingHours}
                    variant="outlined"
                    margin="dense"
                  />
                  <FormControlLabel
                    control={
                      <Field
                        as={Switch}
                        color="primary"
                        name="useoutServiceMessage"
                        checked={values.useoutServiceMessage}
                      />
                    }
                    label={i18n.t("whatsappModal.form.useoutServiceMessage")}
                  />
                </div>
                <QueueSelect
                  selectedQueueIds={selectedQueueIds}
                  onChange={(selectedIds) => setSelectedQueueIds(selectedIds)}
                />
              </DialogContent>
              <DialogActions>
                <Button
                  onClick={handleClose}
                  color="secondary"
                  disabled={isSubmitting}
                  variant="outlined"
                >
                  {i18n.t("whatsappModal.buttons.cancel")}
                </Button>
                <Button
                  type="submit"
                  color="primary"
                  disabled={isSubmitting}
                  variant="contained"
                  className={classes.btnWrapper}
                >
                  {whatsAppId
                    ? i18n.t("whatsappModal.buttons.okEdit")
                    : i18n.t("whatsappModal.buttons.okAdd")}
                  {isSubmitting && (
                    <CircularProgress
                      size={24}
                      className={classes.buttonProgress}
                    />
                  )}
                </Button>
              </DialogActions>
            </Form>
          )}
        </Formik>
      </Dialog>
    </div>
  );
};

export default React.memo(WhatsAppModal);
