'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add unique constraint to ApprovalRecords
    try {
      await queryInterface.addConstraint('ApprovalRecords', {
        fields: ['applicationId', 'hrUserId', 'approvalStage'],
        type: 'unique',
        name: 'unique_approval_record_per_stage'
      });
    } catch (error) {
      console.log('Constraint unique_approval_record_per_stage may already exist', error.message);
    }

    // 2. Add foreign keys to Applications (candidate_id, job_id)
    try {
      await queryInterface.addConstraint('Applications', {
        fields: ['candidate_id'],
        type: 'foreign key',
        name: 'fk_application_candidate_id',
        references: { table: 'Candidates', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    } catch (error) {
      console.log('Constraint fk_application_candidate_id may already exist', error.message);
    }

    try {
      await queryInterface.addConstraint('Applications', {
        fields: ['job_id'],
        type: 'foreign key',
        name: 'fk_application_job_id',
        references: { table: 'Jobs', field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    } catch (error) {
      console.log('Constraint fk_application_job_id may already exist', error.message);
    }

    // 3. Add Indexes to Offers and InterviewSessions to optimize lookups
    try {
      await queryInterface.addIndex('Offers', ['application_id', 'status'], {
        name: 'idx_offers_application_status'
      });
    } catch (error) {
      console.log('Index idx_offers_application_status may already exist', error.message);
    }
    
    try {
      await queryInterface.addIndex('InterviewSessions', ['application_id', 'status'], {
        name: 'idx_interview_sessions_application_status'
      });
    } catch (error) {
      console.log('Index idx_interview_sessions_application_status may already exist', error.message);
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      await queryInterface.removeConstraint('ApprovalRecords', 'unique_approval_record_per_stage');
    } catch (error) {
      console.log('Could not remove constraint unique_approval_record_per_stage', error.message);
    }
    
    try {
      await queryInterface.removeConstraint('Applications', 'fk_application_candidate_id');
    } catch (error) {
      console.log('Could not remove constraint fk_application_candidate_id', error.message);
    }

    try {
      await queryInterface.removeConstraint('Applications', 'fk_application_job_id');
    } catch (error) {
      console.log('Could not remove constraint fk_application_job_id', error.message);
    }

    try {
      await queryInterface.removeIndex('Offers', 'idx_offers_application_status');
    } catch (error) {
      console.log('Could not remove index idx_offers_application_status', error.message);
    }

    try {
      await queryInterface.removeIndex('InterviewSessions', 'idx_interview_sessions_application_status');
    } catch (error) {
      console.log('Could not remove index idx_interview_sessions_application_status', error.message);
    }
  }
};
