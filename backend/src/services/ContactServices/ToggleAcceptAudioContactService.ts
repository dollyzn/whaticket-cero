import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";

interface Request {
  contactId: string;
}

const ToggleUseQueuesContactService = async ({
  contactId
}: Request): Promise<Contact> => {
  const contact = await Contact.findOne({
    where: { id: contactId },
    attributes: ["id", "acceptAudioMessage"]
  });

  if (!contact) {
    throw new AppError("ERR_NO_CONTACT_FOUND", 404);
  }

  const acceptAudioMessage = contact.acceptAudioMessage ? false : true;

  await contact.update({
    acceptAudioMessage
  });

  await contact.reload({
    attributes: ["id", "name", "number", "email", "profilePicUrl", "useQueues", "acceptAudioMessage", "useDialogflow"],
    include: ["extraInfo"]
  });  

  return contact;
};

export default ToggleUseQueuesContactService;
