Feature: User Management
  As an administrator
  I want to manage users in my organization
  So that my team can access the platform

  Scenario: List users
    Given I am an authenticated user
    When I request the list of users
    Then the response status code should be 200
    And the response should contain at least 1 user

  Scenario: Invite a user
    Given I am an authenticated user
    When I invite a new user "colleague@example.com" as "researcher"
    Then the response status code should be 200
    And the response should confirm the invite

  Scenario: Delete a user
    Given I am an authenticated user
    And I have another user in the same organization
    When I delete the other user
    Then the response status code should be 204
