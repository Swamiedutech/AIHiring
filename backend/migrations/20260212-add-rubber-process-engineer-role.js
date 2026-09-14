'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Update TechnicalQuestionBank enum to include RUBBER_PROCESS_ENGINEER
    await queryInterface.changeColumn('technical_question_bank', 'jobRole', {
      type: Sequelize.ENUM(
        "SENIOR_AI_ENGINEER",
        "FULL_STACK_DEVELOPER",
        "DATA_SCIENTIST",
        "QA_ENGINEER",
        "DEVOPS_ENGINEER",
        "MANAGEMENT_TRAINEE_MARKETING",
        "EXECUTIVE_MARKETING",
        "ASSISTANT_MANAGER_MARKETING",
        "RUBBER_PROCESS_ENGINEER"
      ),
      allowNull: false,
    });

    // Update InterviewQuestionBank enum to include RUBBER_PROCESS_ENGINEER
    await queryInterface.changeColumn('interview_question_bank', 'jobRole', {
      type: Sequelize.ENUM(
        "SENIOR_AI_ENGINEER",
        "FULL_STACK_DEVELOPER",
        "DATA_SCIENTIST",
        "QA_ENGINEER",
        "DEVOPS_ENGINEER",
        "MANAGEMENT_TRAINEE_MARKETING",
        "EXECUTIVE_MARKETING",
        "ASSISTANT_MANAGER_MARKETING",
        "RUBBER_PROCESS_ENGINEER"
      ),
      allowNull: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert TechnicalQuestionBank enum
    await queryInterface.changeColumn('technical_question_bank', 'jobRole', {
      type: Sequelize.ENUM(
        "SENIOR_AI_ENGINEER",
        "FULL_STACK_DEVELOPER",
        "DATA_SCIENTIST",
        "QA_ENGINEER",
        "DEVOPS_ENGINEER",
        "MANAGEMENT_TRAINEE_MARKETING",
        "EXECUTIVE_MARKETING",
        "ASSISTANT_MANAGER_MARKETING"
      ),
      allowNull: false,
    });

    // Revert InterviewQuestionBank enum
    await queryInterface.changeColumn('interview_question_bank', 'jobRole', {
      type: Sequelize.ENUM(
        "SENIOR_AI_ENGINEER",
        "FULL_STACK_DEVELOPER",
        "DATA_SCIENTIST",
        "QA_ENGINEER",
        "DEVOPS_ENGINEER",
        "MANAGEMENT_TRAINEE_MARKETING",
        "EXECUTIVE_MARKETING",
        "ASSISTANT_MANAGER_MARKETING"
      ),
      allowNull: false,
    });
  }
};