import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";

interface Dialogflow {
  useDialogflow?: boolean;
  useDialogflowToggle?: boolean;
}

interface Request {
  contactId: string;
  setUseDialogFlow: Dialogflow;
}

const ToggleUseDialogflowContactService = async ({
  contactId,
  setUseDialogFlow
}: Request): Promise<Contact> => {
  let { useDialogflow, useDialogflowToggle } = setUseDialogFlow;
  const contact = await Contact.findOne({
    where: { id: contactId },
    attributes: ["id", "useDialogflow"]
  });

  if (useDialogflowToggle) {
    useDialogflow = contact?.useDialogflow ? false : true;
  }

  if (!contact) {
    throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  }

  await contact.update({
    useDialogflow
  });

  await contact.reload({
    attributes: ["id", "name", "number", "email", "profilePicUrl", "useQueues", "useDialogflow"],
    include: ["extraInfo"]
  });

  return contact;
};

export default ToggleUseDialogflowContactService;
