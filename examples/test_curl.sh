#!/bin/bash

# Test script for Customer Interaction Agent
# Requires server running on localhost:3000

BASE_URL="http://localhost:3000"
PHONE="+15551234567"

echo "===== Customer Interaction Agent - Test Suite ====="
echo

# Test 1: Health check
echo "1. Testing health check..."
curl -s $BASE_URL/health | json_pp
echo

# Test 2: Initialize Sheets
echo "2. Initializing Google Sheet..."
curl -s $BASE_URL/init | json_pp
echo

# Test 3: Mock incoming SMS - initial inquiry
echo "3. Simulating SMS: Customer inquires about plumbing..."
curl -s -X POST $BASE_URL/webhook/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=$PHONE&Body=Hi%2C+I+need+plumbing+for+a+leaky+sink" \
  -d "MessageSid=SM$(date +%s)"
sleep 2
echo "✓ SMS processed"
echo

# Test 4: View conversation history
echo "4. Viewing conversation history..."
curl -s $BASE_URL/admin/conversation/$PHONE | json_pp
echo

# Test 5: Follow-up with date preference
echo "5. Simulating follow-up SMS: Customer provides date..."
curl -s -X POST $BASE_URL/webhook/sms \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=$PHONE&Body=Can+you+do+next+Thursday+morning%3F" \
  -d "MessageSid=SM$(date +%s)"
sleep 2
echo "✓ SMS processed"
echo

# Test 6: View updated conversation
echo "6. Updated conversation history..."
curl -s $BASE_URL/admin/conversation/$PHONE | json_pp
echo

# Test 7: View all leads
echo "7. Fetching all leads from CRM..."
curl -s $BASE_URL/admin/leads | json_pp
echo

echo "===== Test Suite Complete ====="
echo "Note: For booking confirmation, manually reply with 'Book 1' or 'Book 2'"
