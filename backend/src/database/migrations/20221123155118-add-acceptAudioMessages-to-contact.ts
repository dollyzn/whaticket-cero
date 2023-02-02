import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.addColumn("Contacts", "acceptAudioMessage", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Contacts", "acceptAudioMessage");
  }
};
