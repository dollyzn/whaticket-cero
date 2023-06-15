import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.addColumn("Queues", "menuname", {
      type: DataTypes.STRING,
      allowNull: false
    });
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.removeColumn("Queues", "menuname");
  }
};
