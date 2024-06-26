import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  Default,
  AllowNull,
  HasMany,
  Unique,
  BelongsToMany
} from "sequelize-typescript";
import Queue from "./Queue";
import Ticket from "./Ticket";
import WhatsappQueue from "./WhatsappQueue";

@Table
class Whatsapp extends Model<Whatsapp> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull
  @Unique
  @Column(DataType.TEXT)
  name: string;

  @Column(DataType.TEXT)
  number: string;

  @Column(DataType.TEXT)
  session: string;

  @Column(DataType.TEXT)
  qrcode: string;

  @Column(DataType.STRING)
  pairingCode: string;

  @Column
  status: string;

  @Column
  battery: string;

  @Column
  plugged: boolean;

  @Column
  retries: number;

  @Column(DataType.TEXT)
  greetingMessage: string;

  @Column(DataType.TEXT)
  farewellMessage: string;

  @Column(DataType.TEXT)
  outServiceMessage: string;

  @Column(DataType.TEXT)
  feedbackMessage: string;

  @Column(DataType.TIME)
  openingHours: string;

  @Column(DataType.TIME)
  closingHours: string;

  @Default(false)
  @AllowNull
  @Column
  isDefault: boolean;

  @Default(false)
  @Column(DataType.BOOLEAN)
  requestCode: boolean;

  @Default(false)
  @AllowNull
  @Column
  useoutServiceMessage: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @HasMany(() => Ticket)
  tickets: Ticket[];

  @BelongsToMany(() => Queue, () => WhatsappQueue)
  queues: Array<Queue & { WhatsappQueue: WhatsappQueue }>;

  @HasMany(() => WhatsappQueue)
  whatsappQueues: WhatsappQueue[];
}

export default Whatsapp;
