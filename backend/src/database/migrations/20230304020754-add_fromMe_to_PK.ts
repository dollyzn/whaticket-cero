import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.sequelize.query(
      "ALTER TABLE Messages DROP PRIMARY KEY, ADD CONSTRAINT Messages_PK PRIMARY KEY (id, fromMe)"
    );
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.sequelize.query(
      "ALTER TABLE Messages DROP PRIMARY KEY, ADD CONSTRAINT Messages_PK PRIMARY KEY (id)"
    );
  }
};
