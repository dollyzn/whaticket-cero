import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.createTable("Whatsapps", {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      session: {
        type: DataTypes.TEXT
      },
      qrcode: {
        type: DataTypes.TEXT
      },
      status: {
        type: DataTypes.STRING
      },
      battery: {
        type: DataTypes.STRING
      },
      plugged: {
        type: DataTypes.BOOLEAN
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      openingHours: {
        type: DataTypes.TIME
      },
      closingHours: {
        type: DataTypes.TIME
      },
      outServiceMessage: {
        type: DataTypes.TEXT
      },
      useoutServiceMessage: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.dropTable("Whatsapps");
  }
};
