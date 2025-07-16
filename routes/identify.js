const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Contact = require('../models/contact');

// Helper to get all related contacts (by email/phone or linkedId)
async function getAllRelatedContacts(email, phoneNumber) {
  // Find all contacts with matching email or phone
  let contacts = await Contact.findAll({
    where: {
      [Op.or]: [
        email ? { email } : null,
        phoneNumber ? { phoneNumber } : null,
      ].filter(Boolean),
      deletedAt: null,
    },
    raw: true,
  });

  if (contacts.length === 0) return [];

  // Get all unique linkedId/ids
  let ids = new Set();
  contacts.forEach(c => {
    ids.add(c.id);
    if (c.linkedId) ids.add(c.linkedId);
  });

  // Find all contacts in this cluster
  let allContacts = await Contact.findAll({
    where: {
      [Op.or]: [
        { id: Array.from(ids) },
        { linkedId: Array.from(ids) },
      ],
      deletedAt: null,
    },
    raw: true,
  });
  return allContacts;
}

router.post('/', async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;
    if (!email && !phoneNumber) {
      return res.status(400).json({ error: 'At least one of email or phoneNumber is required.' });
    }

    // 1. Find all related contacts
    let relatedContacts = await getAllRelatedContacts(email, phoneNumber);

    // 2. If none found, create new primary
    if (relatedContacts.length === 0) {
      const newContact = await Contact.create({
        email: email || null,
        phoneNumber: phoneNumber || null,
        linkPrecedence: 'primary',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return res.json({
        contact: {
          primaryContatctId: newContact.id,
          emails: [newContact.email].filter(Boolean),
          phoneNumbers: [newContact.phoneNumber].filter(Boolean),
          secondaryContactIds: [],
        },
      });
    }

    // 3. There are related contacts, find the primary (oldest)
    let primaries = relatedContacts.filter(c => c.linkPrecedence === 'primary');
    let primary = primaries.reduce((oldest, c) =>
      new Date(c.createdAt) < new Date(oldest.createdAt) ? c : oldest, primaries[0]);

    // 4. Merge clusters if multiple primaries
    for (let c of primaries) {
      if (c.id !== primary.id) {
        // Update to secondary
        await Contact.update(
          { linkPrecedence: 'secondary', linkedId: primary.id, updatedAt: new Date() },
          { where: { id: c.id } }
        );
      }
    }

    // 5. Check if new info (email/phone) is not present in any contact
    let emails = new Set(relatedContacts.map(c => c.email).filter(Boolean));
    let phones = new Set(relatedContacts.map(c => c.phoneNumber).filter(Boolean));
    let needNew = false;
    if (email && !emails.has(email)) needNew = true;
    if (phoneNumber && !phones.has(phoneNumber)) needNew = true;

    if (needNew) {
      // Create secondary contact
      await Contact.create({
        email: email || null,
        phoneNumber: phoneNumber || null,
        linkPrecedence: 'secondary',
        linkedId: primary.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      // Re-fetch all related contacts
      relatedContacts = await getAllRelatedContacts(email, phoneNumber);
      emails = new Set(relatedContacts.map(c => c.email).filter(Boolean));
      phones = new Set(relatedContacts.map(c => c.phoneNumber).filter(Boolean));
    }

    // 6. Build response
    // Get all contacts in the cluster (including new ones)
    const allContacts = await getAllRelatedContacts(primary.email, primary.phoneNumber);
    const allEmails = [];
    const allPhones = [];
    const secondaryIds = [];
    // Sort by createdAt for order
    allContacts.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    for (let c of allContacts) {
      if (c.linkPrecedence === 'primary') {
        if (c.email && !allEmails.includes(c.email)) allEmails.push(c.email);
        if (c.phoneNumber && !allPhones.includes(c.phoneNumber)) allPhones.push(c.phoneNumber);
      }
    }
    for (let c of allContacts) {
      if (c.linkPrecedence === 'secondary') {
        if (c.email && !allEmails.includes(c.email)) allEmails.push(c.email);
        if (c.phoneNumber && !allPhones.includes(c.phoneNumber)) allPhones.push(c.phoneNumber);
        secondaryIds.push(c.id);
      }
    }
    return res.json({
      contact: {
        primaryContatctId: primary.id,
        emails: allEmails,
        phoneNumbers: allPhones,
        secondaryContactIds: secondaryIds,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
