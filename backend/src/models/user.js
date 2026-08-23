const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const User = sequelize.define("User", {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false
    },

    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false
    },

    password: {
      type: DataTypes.STRING,
      allowNull: false
    },

    role: {
      type: DataTypes.STRING, // Changed from ENUM for Supabase compatibility
      allowNull: false
    },

    status: {
      type: DataTypes.STRING,
      defaultValue: "ACTIVE"
    },

    hr_role: {
      type: DataTypes.STRING, // Changed from ENUM for Supabase compatibility
      allowNull: true
    },

    auth_token_revision: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    },

    email_verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    otp: {
      type: DataTypes.STRING,
      allowNull: true
    },

    otp_expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    tableName: "Users",
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  });

  User.prototype.toJSON = function () {
    let values = Object.assign({}, this.get());
    delete values.password;
    delete values.otp;
    delete values.otp_expires_at;
    delete values.auth_token_revision;
    return values;
  };

  return User;
};