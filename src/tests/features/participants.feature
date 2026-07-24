Feature: Participants Management
  As a researcher
  I want to manage participants
  So that I can link their data to studies

  Scenario: Create a participant
    Given I am an authenticated user
    And I have created a study with name "Participant Study"
    When I create a participant with code "SUBJ001"
    Then the response status code should be 200
    And the response should contain the participant code "SUBJ001"

  Scenario: List participants for a study
    Given I am an authenticated user
    And I have created a study with name "Study For Listing"
    And I have created a participant with code "SUBJ100" in this study
    When I request the list of participants for this study
    Then the response status code should be 200
    And the response should contain the participant code "SUBJ100"

  Scenario: Update participant consent
    Given I am an authenticated user
    And I have created a study with name "Consent Study"
    And I have created a participant with code "SUBJ200" in this study
    When I update the participant consent to "consented"
    Then the response status code should be 200

  Scenario: Request participant deletion
    Given I am an authenticated user
    And I have created a study with name "Deletion Study"
    And I have created a participant with code "SUBJ300" in this study
    When I request deletion for the participant
    Then the response status code should be 202
    And the response should confirm the deletion request
