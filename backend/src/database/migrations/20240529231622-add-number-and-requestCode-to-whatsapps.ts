import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Whatsapps", "requestCode", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    await queryInterface.addColumn("Whatsapps", "number", {
      type: DataTypes.STRING,
      defaultValue: ""
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "requestCode");
    await queryInterface.removeColumn("Whatsapps", "number");
  }
};
